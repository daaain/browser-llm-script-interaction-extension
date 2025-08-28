import { describe, expect, it } from 'vitest';
import type { ExtensionSettings, LLMProvider, MessageFromSidebar } from '~/utils/types';
import { isExtensionSettings, isMessageFromSidebar } from '~/utils/types';

describe('Type Guards', () => {
  describe('isMessageFromSidebar', () => {
    it('should return true for valid MessageFromSidebar objects', () => {
      const validMessages: MessageFromSidebar[] = [
        { type: 'SEND_MESSAGE', payload: { message: 'test' } },
        { type: 'GET_SETTINGS', payload: null },
        { type: 'SAVE_SETTINGS', payload: {} as ExtensionSettings },
        { type: 'EXECUTE_FUNCTION', payload: { function: 'screenshot', arguments: {} } },
        { type: 'CLEAR_TAB_CONVERSATION', payload: { tabId: 123 } },
        { type: 'CAPTURE_SCREENSHOT', payload: null },
        { type: 'TEST_CONNECTION', payload: null },
        { type: 'GET_RESPONSE_PAGE', payload: { responseId: 'test', page: 1 } },
      ];

      validMessages.forEach((msg) => {
        expect(isMessageFromSidebar(msg)).toBe(true);
      });
    });

    it('should return false for invalid messages', () => {
      const invalidMessages = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { type: 'INVALID_TYPE' },
        { type: 123 },
        { notType: 'SEND_MESSAGE' },
      ];

      invalidMessages.forEach((msg) => {
        expect(isMessageFromSidebar(msg)).toBe(false);
      });
    });
  });

  describe('isExtensionSettings', () => {
    it('should return true for valid ExtensionSettings objects', () => {
      const validProvider: LLMProvider = {
        name: 'LM Studio',
        endpoint: 'http://localhost:1234/v1/chat/completions',
        model: 'test-model',
        apiKey: '',
      };

      const validSettings: ExtensionSettings = {
        provider: validProvider,
        chatHistory: [],
        debugMode: false,
        truncationLimit: 10,
        toolsEnabled: true,
        screenshotToolEnabled: false,
      };

      expect(isExtensionSettings(validSettings)).toBe(true);
    });

    it('should return false for invalid settings objects', () => {
      const invalidSettings = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { provider: 'valid' }, // Missing required fields
        { provider: 123 as any, chatHistory: [] }, // Invalid provider type
        { provider: 'valid', chatHistory: 'not-array' }, // Invalid chatHistory type
        { provider: 'valid', chatHistory: [], debugMode: 'not-boolean' }, // Invalid debugMode
        { provider: 'valid', chatHistory: [], debugMode: true, truncationLimit: 'not-number' }, // Invalid truncationLimit
      ];

      invalidSettings.forEach((settings) => {
        expect(isExtensionSettings(settings)).toBe(false);
      });
    });

    it('should handle partial settings objects', () => {
      const partialSettings = {
        provider: { name: 'OpenAI', endpoint: 'test', model: 'gpt-4' },
        chatHistory: [],
        debugMode: true,
        truncationLimit: 5,
        // Missing optional fields like toolsEnabled
      };

      // Should still validate based on required fields
      expect(isExtensionSettings(partialSettings)).toBe(false);
    });
  });
});
