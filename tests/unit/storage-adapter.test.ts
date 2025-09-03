import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock browser API with factory function
vi.mock('webextension-polyfill', () => {
  return {
    default: {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
          clear: vi.fn(),
        },
      },
    },
  };
});

import browser from 'webextension-polyfill';
// Import after mocks
import { createStorageAdapter, type StorageAdapter } from '~/utils/storage-adapter';

describe('StorageAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Extension Storage Backend', () => {
    let adapter: StorageAdapter<string>;

    beforeEach(async () => {
      adapter = await createStorageAdapter<string>();
    });

    it('should get values from extension storage', async () => {
      const testValue = 'test-value';
      vi.mocked(browser.storage.local.get).mockResolvedValue({ 'test-key': testValue });

      const result = await adapter.get('test-key');

      expect(result).toBe(testValue);
      expect(browser.storage.local.get).toHaveBeenCalledWith(['test-key']);
    });

    it('should set values in extension storage', async () => {
      const testValue = 'test-value';
      vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);

      await adapter.set('test-key', testValue);

      expect(browser.storage.local.set).toHaveBeenCalledWith({ 'test-key': testValue });
    });

    it('should delete values from extension storage', async () => {
      vi.mocked(browser.storage.local.remove).mockResolvedValue(undefined);

      await adapter.delete('test-key');

      expect(browser.storage.local.remove).toHaveBeenCalledWith(['test-key']);
    });

    it('should clear extension storage', async () => {
      vi.mocked(browser.storage.local.clear).mockResolvedValue(undefined);

      await adapter.clear();

      expect(browser.storage.local.clear).toHaveBeenCalled();
    });

    it('should get all keys from extension storage', async () => {
      const testData = { key1: 'value1', key2: 'value2' };
      vi.mocked(browser.storage.local.get).mockResolvedValue(testData);

      const keys = await adapter.getAllKeys();

      expect(keys).toEqual(['key1', 'key2']);
      expect(browser.storage.local.get).toHaveBeenCalledWith(null);
    });

    it('should handle storage errors gracefully', async () => {
      const error = new Error('Storage error');
      vi.mocked(browser.storage.local.get).mockRejectedValue(error);

      const result = await adapter.get('test-key');

      expect(result).toBeNull();
    });
  });
});
