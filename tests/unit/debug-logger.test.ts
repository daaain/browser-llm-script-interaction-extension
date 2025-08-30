import { describe, expect, it, vi } from 'vitest';

// Mock browser API
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
    },
  },
}));

// Mock storage adapter with simple implementation
vi.mock('~/utils/storage-adapter', () => ({
  createStorageAdapter: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue([]),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getAllKeys: vi.fn().mockResolvedValue([]),
  }),
  DEFAULT_LOG_STORAGE_CONFIG: {
    maxLogEntries: 100000,
  },
}));

import { DebugLogger } from '~/utils/debug-logger';

describe('DebugLogger', () => {
  it('should create singleton instances per context', () => {
    const logger1 = DebugLogger.getInstance('content');
    const logger2 = DebugLogger.getInstance('content');
    const logger3 = DebugLogger.getInstance('background');

    expect(logger1).toBe(logger2);
    expect(logger1).not.toBe(logger3);
  });

  it('should not throw when logging', () => {
    const logger = DebugLogger.getInstance('content');

    expect(() => logger.debug('Test debug')).not.toThrow();
    expect(() => logger.info('Test info')).not.toThrow();
    expect(() => logger.warn('Test warn')).not.toThrow();
    expect(() => logger.error('Test error')).not.toThrow();
  });
});
