/**
 * Cross-Thread Debug Logger
 *
 * This utility provides logging that works across different extension contexts
 * (background worker, sidepanel, content scripts) by storing logs in extension
 * storage and providing a way to view them from the UI.
 */

import browser from 'webextension-polyfill';
import {
  createStorageAdapter,
  DEFAULT_LOG_STORAGE_CONFIG,
  type LogStorageConfig,
  type StorageAdapter,
} from './storage-adapter';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  context: 'background' | 'sidepanel' | 'content' | 'options';
  message: string;
  data?: any;
}

export interface LogQueryOptions {
  level?: LogEntry['level'][];
  context?: LogEntry['context'][];
  since?: number; // timestamp
  until?: number; // timestamp
  limit?: number;
  offset?: number;
}

/**
 * Type guard to validate if an object is a valid LogEntry
 */
function isValidLogEntry(obj: any): obj is LogEntry {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'number' &&
    ['debug', 'info', 'warn', 'error'].includes(obj.level) &&
    ['background', 'sidepanel', 'content', 'options'].includes(obj.context) &&
    typeof obj.message === 'string'
  );
}

/**
 * Type guard to validate if an array contains valid LogEntry objects
 */
function isValidLogEntryArray(arr: any): arr is LogEntry[] {
  return Array.isArray(arr) && arr.every(isValidLogEntry);
}

export class DebugLogger {
  private static instances: Map<LogEntry['context'], DebugLogger> = new Map();
  private static sharedStorage: StorageAdapter<LogEntry[]> | null = null;
  private context: LogEntry['context'];
  private config: Required<LogStorageConfig>;
  private static logKey = 'debug_logs_shared';
  private static metaKey = 'debug_logs_meta';
  private static maxChunkSize = 1000; // Maximum entries per storage operation
  private cleanupTasks: Array<() => void> = [];
  private pendingOperations: Set<Promise<any>> = new Set();

  private constructor(context: LogEntry['context'], config?: LogStorageConfig) {
    this.context = context;
    this.config = { ...DEFAULT_LOG_STORAGE_CONFIG, ...config };
    this.initializeStorage();
  }

  static getInstance(context: LogEntry['context'], config?: LogStorageConfig): DebugLogger {
    if (!DebugLogger.instances.has(context)) {
      DebugLogger.instances.set(context, new DebugLogger(context, config));
    }
    return DebugLogger.instances.get(context)!;
  }

  private async initializeStorage(): Promise<void> {
    try {
      // Initialize shared storage only once
      if (!DebugLogger.sharedStorage) {
        DebugLogger.sharedStorage = await createStorageAdapter<LogEntry[]>();
      }
    } catch (error) {
      console.error('Failed to initialize storage for debug logger:', error);
      // Fall back to console-only logging
    }
  }

  private async storeLogs(logs: LogEntry[]): Promise<void> {
    try {
      if (DebugLogger.sharedStorage) {
        await DebugLogger.sharedStorage.set(DebugLogger.logKey, logs);
      } else {
        // Fallback to extension storage
        await browser.storage.local.set({ [DebugLogger.logKey]: logs });
      }
    } catch (error) {
      console.error('Failed to store debug logs:', error);
      // Try fallback storage
      try {
        await browser.storage.local.set({ [DebugLogger.logKey]: logs });
      } catch (fallbackError) {
        console.error('Failed to store debug logs in fallback storage:', fallbackError);
      }
    }
  }

  private async getLogs(): Promise<LogEntry[]> {
    try {
      if (DebugLogger.sharedStorage) {
        const logs = await DebugLogger.sharedStorage.get(DebugLogger.logKey);
        if (logs && isValidLogEntryArray(logs)) {
          return logs;
        }
        return [];
      } else {
        // Fallback to extension storage
        const result = await browser.storage.local.get([DebugLogger.logKey]);
        const logs = result[DebugLogger.logKey];
        if (logs && isValidLogEntryArray(logs)) {
          return logs;
        }
        return [];
      }
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      // Try fallback storage
      try {
        const result = await browser.storage.local.get([DebugLogger.logKey]);
        const logs = result[DebugLogger.logKey];
        if (logs && isValidLogEntryArray(logs)) {
          return logs;
        }
        return [];
      } catch (fallbackError) {
        console.error('Failed to get debug logs from fallback storage:', fallbackError);
        return [];
      }
    }
  }

  private generateLogId(): string {
    return `${this.context}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async addLog(level: LogEntry['level'], message: string, data?: any): Promise<void> {
    const logEntry: LogEntry = {
      id: this.generateLogId(),
      timestamp: Date.now(),
      level,
      context: this.context,
      message,
      data,
    };

    // Always log to browser console as well
    const consoleMessage = `[${this.context.toUpperCase()}] ${message}`;
    switch (level) {
      case 'debug':
        console.debug(consoleMessage, data);
        break;
      case 'info':
        console.info(consoleMessage, data);
        break;
      case 'warn':
        console.warn(consoleMessage, data);
        break;
      case 'error':
        console.error(consoleMessage, data);
        break;
    }

    // Create and track the async operation
    const operation = (async () => {
      try {
        // Get maxLogEntries from settings
        let maxLogEntries = this.config.maxLogEntries; // fallback default
        try {
          const settings = await browser.storage.local.get(['settings']);
          if (
            settings.settings &&
            typeof settings.settings === 'object' &&
            'maxLogEntries' in settings.settings
          ) {
            maxLogEntries = Number(settings.settings.maxLogEntries) || this.config.maxLogEntries;
          }
        } catch (settingsError) {
          // Use fallback if settings can't be accessed
        }

        await this.appendLogEfficiently(logEntry, maxLogEntries);
      } catch (error) {
        console.error('Failed to add debug log:', error);
      }
    })();

    // Track the operation for cleanup
    this.pendingOperations.add(operation);
    operation.finally(() => {
      this.pendingOperations.delete(operation);
    });

    return operation;
  }

  /**
   * Efficiently append a log entry using chunked storage approach
   */
  private async appendLogEfficiently(logEntry: LogEntry, maxLogEntries: number): Promise<void> {
    try {
      // For small limits or when we're close to the limit, use the simple approach
      if (maxLogEntries <= DebugLogger.maxChunkSize) {
        const logs = await this.getLogs();
        logs.push(logEntry);

        if (logs.length > maxLogEntries) {
          logs.splice(0, logs.length - maxLogEntries);
        }

        await this.storeLogs(logs);
        return;
      }

      // For larger limits, use a more sophisticated approach
      // Get current log count without loading all logs
      const currentLogs = await this.getLogs();
      const currentCount = currentLogs.length;

      if (currentCount < maxLogEntries) {
        // Simple append - we're under the limit
        currentLogs.push(logEntry);
        await this.storeLogs(currentLogs);
      } else {
        // We need to remove old entries - use circular buffer approach
        // Remove the oldest 10% of entries and add the new one
        const removeCount = Math.max(1, Math.floor(maxLogEntries * 0.1));
        const trimmedLogs = currentLogs.slice(removeCount);
        trimmedLogs.push(logEntry);
        await this.storeLogs(trimmedLogs);
      }
    } catch (error) {
      // Fallback to simple approach if anything goes wrong
      const logs = await this.getLogs();
      logs.push(logEntry);
      if (logs.length > maxLogEntries) {
        logs.splice(0, logs.length - maxLogEntries);
      }
      await this.storeLogs(logs);
    }
  }

  debug(message: string, data?: any): void {
    this.addLog('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any): void {
    // Enhanced error logging with automatic stack trace capture
    let errorData = data;

    if (data instanceof Error) {
      const baseErrorData = {
        message: data.message,
        stack: data.stack,
        name: data.name,
      };

      // Add cause if it exists (ES2022+ feature)
      if ('cause' in data && data.cause) {
        errorData = { ...baseErrorData, cause: data.cause };
      } else {
        errorData = baseErrorData;
      }
    } else if (data && typeof data === 'object' && 'stack' in data) {
      // Already has stack trace, keep as is
      errorData = data;
    } else {
      // Capture stack trace from current location
      const error = new Error();
      errorData = {
        ...data,
        capturedStack: error.stack?.split('\n').slice(2).join('\n'), // Remove first 2 lines (Error + this function)
      };
    }

    this.addLog('error', message, errorData);
  }

  async getAllLogs(): Promise<LogEntry[]> {
    return this.getLogs();
  }

  async clearLogs(): Promise<void> {
    try {
      if (DebugLogger.sharedStorage) {
        await DebugLogger.sharedStorage.delete(DebugLogger.logKey);
      } else {
        await browser.storage.local.remove([DebugLogger.logKey]);
      }
    } catch (error) {
      console.error('Failed to clear debug logs:', error);
    }
  }

  async getLogsForDisplay(options: LogQueryOptions = {}): Promise<string> {
    const queryOptions = { limit: 50, ...options };
    const logs = await this.queryLogs(queryOptions);

    return logs
      .map((log) => {
        const time = new Date(log.timestamp).toISOString();
        const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
        return `[${time}] [${log.level.toUpperCase()}] [${log.context.toUpperCase()}] ${log.message}${dataStr}`;
      })
      .join('\n');
  }

  async queryLogs(options: LogQueryOptions = {}): Promise<LogEntry[]> {
    const logs = await this.getLogs();

    let filtered = logs;

    if (options.level && options.level.length > 0) {
      filtered = filtered.filter((log) => options.level!.includes(log.level));
    }

    if (options.context && options.context.length > 0) {
      filtered = filtered.filter((log) => options.context!.includes(log.context));
    }

    if (options.since) {
      filtered = filtered.filter((log) => log.timestamp >= options.since!);
    }

    if (options.until) {
      filtered = filtered.filter((log) => log.timestamp <= options.until!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const offset = options.offset || 0;
    const limit = options.limit || filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  async getLogStats(): Promise<{
    total: number;
    byLevel: Record<LogEntry['level'], number>;
    byContext: Record<LogEntry['context'], number>;
  }> {
    const logs = await this.getLogs();

    const byLevel = { debug: 0, info: 0, warn: 0, error: 0 };
    const byContext = { background: 0, sidepanel: 0, content: 0, options: 0 };

    for (const log of logs) {
      byLevel[log.level]++;
      byContext[log.context]++;
    }

    return {
      total: logs.length,
      byLevel,
      byContext,
    };
  }

  /**
   * Send logs to sidepanel for real-time viewing
   */
  async sendLogsToSidepanel(options?: LogQueryOptions): Promise<void> {
    try {
      const logs = await this.queryLogs(options || { limit: 50 });
      const logDisplay = logs
        .map((log) => {
          const time = new Date(log.timestamp).toISOString();
          const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
          return `[${time}] [${log.level.toUpperCase()}] [${log.context.toUpperCase()}] ${log.message}${dataStr}`;
        })
        .join('\n');

      // Try to send to sidepanel if it exists
      browser.runtime
        .sendMessage({
          type: 'DEBUG_LOGS_UPDATE',
          payload: { logs: logDisplay, entries: logs },
        })
        .catch(() => {
          // Ignore errors if sidepanel isn't listening
        });
    } catch (error) {
      console.error('Failed to send logs to sidepanel:', error);
    }
  }

  /**
   * Cleanup resources when logger is no longer needed
   */
  async destroy(): Promise<void> {
    try {
      // Wait for all pending operations to complete
      if (this.pendingOperations.size > 0) {
        await Promise.allSettled(Array.from(this.pendingOperations));
      }

      // Execute cleanup tasks
      for (const cleanup of this.cleanupTasks) {
        try {
          cleanup();
        } catch (error) {
          console.warn('Error during logger cleanup:', error);
        }
      }

      // Clear cleanup tasks
      this.cleanupTasks.length = 0;
      this.pendingOperations.clear();

      // Remove this instance from the static instances map
      DebugLogger.instances.delete(this.context);
    } catch (error) {
      console.error('Error during logger destruction:', error);
    }
  }

  /**
   * Register a cleanup task to be executed when destroy() is called
   */
  addCleanupTask(cleanup: () => void): void {
    this.cleanupTasks.push(cleanup);
  }
}

// Create convenient global instances with optimized storage config
const defaultConfig: LogStorageConfig = {
  maxLogEntries: 10000,
};

/**
 * Get a logger for the current context, detecting the environment automatically if possible
 */
export function getContextLogger(): DebugLogger {
  // Try to detect context automatically
  try {
    // Check if we're in a service worker (background context)
    // Use dynamic access to avoid TypeScript conflicts
    const globalObj = globalThis as Record<string, unknown>;
    if (typeof globalObj.importScripts === 'function') {
      return DebugLogger.getInstance('background', defaultConfig);
    }

    // Check if we're in a content script context
    const windowObj = globalObj.window as Record<string, unknown> | undefined;
    if (windowObj && typeof windowObj.location === 'object' && windowObj.location) {
      const chromeObj = windowObj.chrome as Record<string, unknown> | undefined;
      if (!chromeObj?.extension) {
        return DebugLogger.getInstance('content', defaultConfig);
      }
    }

    // Check if we're in an extension page
    const chromeGlobal = globalObj.chrome as Record<string, Record<string, unknown>> | undefined;
    if (chromeGlobal?.runtime?.id) {
      // Check the current URL to determine if we're in sidepanel or options
      const currentUrl = windowObj?.location
        ? (windowObj.location as { pathname?: string }).pathname
        : '';
      if (currentUrl?.includes('sidepanel')) {
        return DebugLogger.getInstance('sidepanel', defaultConfig);
      }
      if (currentUrl?.includes('options')) {
        return DebugLogger.getInstance('options', defaultConfig);
      }
    }

    // Default to background context
    return DebugLogger.getInstance('background', defaultConfig);
  } catch {
    // Fallback to background context if detection fails
    return DebugLogger.getInstance('background', defaultConfig);
  }
}

// Create convenient global instances with optimized storage config
// These are maintained for backward compatibility but getContextLogger() is preferred
export const backgroundLogger = DebugLogger.getInstance('background', defaultConfig);
export const sidepanelLogger = DebugLogger.getInstance('sidepanel', defaultConfig);
export const contentLogger = DebugLogger.getInstance('content', defaultConfig);
export const optionsLogger = DebugLogger.getInstance('options', defaultConfig);

// Export a factory function for creating loggers with custom config
export function createLogger(context: LogEntry['context'], config?: LogStorageConfig): DebugLogger {
  return DebugLogger.getInstance(context, config);
}

// Cleanup function for when extension is unloaded
export async function cleanupLoggers(): Promise<void> {
  const cleanupPromises = Array.from(DebugLogger['instances'].values()).map((logger) =>
    logger.destroy(),
  );
  await Promise.allSettled(cleanupPromises);
  DebugLogger['instances'].clear();
}
