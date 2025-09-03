import browser from 'webextension-polyfill';

export interface StorageAdapter<T = any> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

class ExtensionStorageAdapter<T> implements StorageAdapter<T> {
  async get(key: string): Promise<T | null> {
    try {
      const result = await browser.storage.local.get([key]);
      return (result[key] as T) || null;
    } catch (error) {
      console.error('Extension storage get operation failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: T): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      throw new Error(
        `Extension storage set error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await browser.storage.local.remove([key]);
    } catch (error) {
      throw new Error(
        `Extension storage delete error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async clear(): Promise<void> {
    try {
      await browser.storage.local.clear();
    } catch (error) {
      throw new Error(
        `Extension storage clear error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const result = await browser.storage.local.get(null);
      return Object.keys(result);
    } catch (error) {
      console.error('Extension storage getAllKeys operation failed', { error });
      return [];
    }
  }
}

export async function createStorageAdapter<T>(): Promise<StorageAdapter<T>> {
  return new ExtensionStorageAdapter<T>();
}

export interface LogStorageConfig {
  maxLogEntries?: number;
}

export const DEFAULT_LOG_STORAGE_CONFIG: Required<LogStorageConfig> = {
  maxLogEntries: 10000,
};
