import { vi } from 'vitest';

// Mock webextension-polyfill for unit tests
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      captureVisibleTab: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

// Mock settings manager if needed
vi.mock('~/utils/settings-manager', () => ({
  settingsManager: {
    getGlobalTruncationLimit: vi.fn().mockReturnValue(5000),
  },
}));
