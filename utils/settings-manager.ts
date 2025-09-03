import browser from 'webextension-polyfill';
import { DEFAULT_TRUNCATION_LIMIT } from '~/utils/constants';
import { backgroundLogger } from '~/utils/debug-logger';
import type { ChatMessage, ExtensionSettings } from '~/utils/types';
import { DEFAULT_PROVIDERS } from '~/utils/types';

export class SettingsManager {
  private static instance: SettingsManager;

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  async getSettings(): Promise<ExtensionSettings> {
    const operationId = `settings-get-${Date.now()}`;
    try {
      const result = await browser.storage.local.get(['settings']);
      if (result.settings) {
        const settings = result.settings as ExtensionSettings;
        let needsUpdate = false;

        if (typeof settings.debugMode === 'undefined') {
          settings.debugMode = true;
          needsUpdate = true;
        }

        if (typeof settings.truncationLimit === 'undefined') {
          settings.truncationLimit = DEFAULT_TRUNCATION_LIMIT;
          needsUpdate = true;
        }

        if (typeof settings.toolsEnabled === 'undefined') {
          settings.toolsEnabled = true;
          needsUpdate = true;
        }

        if (typeof settings.screenshotToolEnabled === 'undefined') {
          settings.screenshotToolEnabled = false;
          needsUpdate = true;
        }

        if (typeof (settings as any).maxLogEntries === 'undefined') {
          (settings as any).maxLogEntries = 10000;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await browser.storage.local.set({ settings });
        }

        return settings;
      }

      backgroundLogger.info('No settings found, creating defaults', { operationId });
      const defaultSettings: ExtensionSettings = {
        provider: {
          ...DEFAULT_PROVIDERS[0],
          apiKey: '',
        },
        chatHistory: [],
        debugMode: true,
        truncationLimit: DEFAULT_TRUNCATION_LIMIT,
        toolsEnabled: true,
        screenshotToolEnabled: false,
        maxLogEntries: 10000,
      };

      await browser.storage.local.set({ settings: defaultSettings });
      backgroundLogger.info('Default settings created and saved', { operationId });
      return defaultSettings;
    } catch (error) {
      backgroundLogger.error('Settings storage access failed', {
        operationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    const operationId = `settings-save-${Date.now()}`;
    try {
      await browser.storage.local.set({ settings });
    } catch (error) {
      backgroundLogger.error('Settings save failed', {
        operationId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async updateTabConversation(tabId: number, conversation: ChatMessage[]): Promise<void> {
    try {
      const settings = await this.getSettings();
      const tabConversations = settings.tabConversations || {};
      tabConversations[tabId.toString()] = conversation;

      await this.saveSettings({
        ...settings,
        tabConversations,
      });
    } catch (error) {
      backgroundLogger.error('Error updating tab conversation', { tabId, error });
      throw error;
    }
  }

  async updateGlobalHistory(conversation: ChatMessage[]): Promise<void> {
    try {
      const settings = await this.getSettings();
      await this.saveSettings({
        ...settings,
        chatHistory: conversation,
      });
    } catch (error) {
      backgroundLogger.error('Error updating global history', { conversation, error });
      throw error;
    }
  }

  async clearTabConversation(tabId: number): Promise<ExtensionSettings> {
    try {
      const settings = await this.getSettings();

      if (settings.tabConversations?.[tabId.toString()]) {
        delete settings.tabConversations[tabId.toString()];
      }

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTabId = tabs[0]?.id;

      if (activeTabId === tabId) {
        settings.chatHistory = [];
      }

      await this.saveSettings(settings);
      return settings;
    } catch (error) {
      backgroundLogger.error('Error clearing tab conversation', { tabId, error });
      throw error;
    }
  }

  async getTabConversation(tabId?: number): Promise<ChatMessage[]> {
    const settings = await this.getSettings();

    if (tabId) {
      return settings.tabConversations?.[tabId.toString()] || [];
    }

    return settings.chatHistory;
  }
}

export const settingsManager = SettingsManager.getInstance();
