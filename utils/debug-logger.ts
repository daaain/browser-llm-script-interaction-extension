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

export class DebugLogger {
  private static instances: Map<LogEntry['context'], DebugLogger> = new Map();
  private static sharedStorage: StorageAdapter<LogEntry[]> | null = null;
  private context: LogEntry['context'];
  private config: Required<LogStorageConfig>;
  private static logKey = 'debug_logs_shared';

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
        return logs || [];
      } else {
        // Fallback to extension storage
        const result = await browser.storage.local.get([DebugLogger.logKey]);
        return (result[DebugLogger.logKey] as LogEntry[]) || [];
      }
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      // Try fallback storage
      try {
        const result = await browser.storage.local.get([DebugLogger.logKey]);
        return (result[DebugLogger.logKey] as LogEntry[]) || [];
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

    try {
      const logs = await this.getLogs();
      logs.push(logEntry);

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

      // Keep only the last maxLogEntries entries
      if (logs.length > maxLogEntries) {
        logs.splice(0, logs.length - maxLogEntries);
      }

      await this.storeLogs(logs);
    } catch (error) {
      console.error('Failed to add debug log:', error);
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
    this.addLog('error', message, data);
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
  destroy(): void {
    // No cleanup needed without auto-pruning
  }
}

// Create convenient global instances with optimized storage config
const defaultConfig: LogStorageConfig = {
  maxLogEntries: 100000,
};

export const backgroundLogger = DebugLogger.getInstance('background', defaultConfig);
export const sidepanelLogger = DebugLogger.getInstance('sidepanel', defaultConfig);
export const contentLogger = DebugLogger.getInstance('content', defaultConfig);
export const optionsLogger = DebugLogger.getInstance('options', defaultConfig);

// Export a factory function for creating loggers with custom config
export function createLogger(context: LogEntry['context'], config?: LogStorageConfig): DebugLogger {
  return DebugLogger.getInstance(context, config);
}

// Cleanup function for when extension is unloaded
export function cleanupLoggers(): void {
  for (const logger of DebugLogger['instances'].values()) {
    logger.destroy();
  }
  DebugLogger['instances'].clear();
}
