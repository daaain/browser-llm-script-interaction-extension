// Chrome extension API types for testing
declare global {
  interface Window {
    chrome: {
      runtime: {
        sendMessage: (message: unknown, callback?: (response: unknown) => void) => void;
      };
      storage: {
        local: {
          get: (
            keys: string | string[] | null,
            callback: (result: Record<string, unknown>) => void,
          ) => void;
          set: (items: Record<string, unknown>, callback?: () => void) => void;
        };
      };
    };
  }
}

export {};
