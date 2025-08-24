/**
 * Cross-Thread Debug Logger
 * 
 * This utility provides logging that works across different extension contexts
 * (background worker, sidepanel, content scripts) by storing logs in extension
 * storage and providing a way to view them from the UI.
 */

import browser from "webextension-polyfill";

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  context: 'background' | 'sidepanel' | 'content' | 'options';
  message: string;
  data?: any;
}

export class DebugLogger {
  private static instance: DebugLogger;
  private context: LogEntry['context'];
  private maxLogs = 1000; // Keep last 1000 log entries
  private logKey = 'debug_logs';

  private constructor(context: LogEntry['context']) {
    this.context = context;
  }

  static getInstance(context: LogEntry['context']): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger(context);
    }
    return DebugLogger.instance;
  }

  private async storeLogs(logs: LogEntry[]): Promise<void> {
    try {
      await browser.storage.local.set({ [this.logKey]: logs });
    } catch (error) {
      console.error('Failed to store debug logs:', error);
    }
  }

  private async getLogs(): Promise<LogEntry[]> {
    try {
      const result = await browser.storage.local.get([this.logKey]);
      return (result[this.logKey] as LogEntry[]) || [];
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      return [];
    }
  }

  private async addLog(level: LogEntry['level'], message: string, data?: any): Promise<void> {
    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      context: this.context,
      message,
      data
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
      
      // Keep only the last maxLogs entries
      if (logs.length > this.maxLogs) {
        logs.splice(0, logs.length - this.maxLogs);
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
      await browser.storage.local.remove([this.logKey]);
    } catch (error) {
      console.error('Failed to clear debug logs:', error);
    }
  }

  async getLogsForDisplay(): Promise<string> {
    const logs = await this.getLogs();
    return logs
      .slice(-50) // Show last 50 logs
      .map(log => {
        const time = new Date(log.timestamp).toISOString();
        const dataStr = log.data ? ` | ${JSON.stringify(log.data)}` : '';
        return `[${time}] [${log.level.toUpperCase()}] [${log.context.toUpperCase()}] ${log.message}${dataStr}`;
      })
      .join('\n');
  }

  /**
   * Send logs to sidepanel for real-time viewing
   */
  async sendLogsToSidepanel(): Promise<void> {
    try {
      const logs = await this.getLogsForDisplay();
      // Try to send to sidepanel if it exists
      browser.runtime.sendMessage({
        type: 'DEBUG_LOGS_UPDATE',
        payload: { logs }
      }).catch(() => {
        // Ignore errors if sidepanel isn't listening
      });
    } catch (error) {
      console.error('Failed to send logs to sidepanel:', error);
    }
  }
}

// Create convenient global instances
export const backgroundLogger = DebugLogger.getInstance('background');
export const sidepanelLogger = DebugLogger.getInstance('sidepanel');
export const contentLogger = DebugLogger.getInstance('content');
export const optionsLogger = DebugLogger.getInstance('options');

// Export a factory function for creating loggers
export function createLogger(context: LogEntry['context']): DebugLogger {
  return DebugLogger.getInstance(context);
}