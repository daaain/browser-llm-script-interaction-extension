import browser from 'webextension-polyfill';
import { DEFAULT_TRUNCATION_LIMIT } from '~/utils/constants';
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
    console.debug('Getting settings from storage...');

    try {
      const result = await browser.storage.local.get(['settings']);
      console.debug('Storage result:', JSON.stringify(result));

      if (result.settings) {
        console.debug('Found existing settings');
        const settings = result.settings as ExtensionSettings;
        let needsUpdate = false;

        if (typeof settings.debugMode === 'undefined') {
          settings.debugMode = true;
          needsUpdate = true;
          console.debug('Added missing debugMode to existing settings');
        }

        if (typeof settings.truncationLimit === 'undefined') {
          settings.truncationLimit = DEFAULT_TRUNCATION_LIMIT;
          needsUpdate = true;
          console.debug('Added missing truncationLimit to existing settings');
        }

        if (typeof settings.toolsEnabled === 'undefined') {
          settings.toolsEnabled = true;
          needsUpdate = true;
          console.debug('Added missing toolsEnabled to existing settings');
        }

        if (typeof settings.screenshotToolEnabled === 'undefined') {
          settings.screenshotToolEnabled = false;
          needsUpdate = true;
          console.debug('Added missing screenshotToolEnabled to existing settings');
        }

        if (needsUpdate) {
          await browser.storage.local.set({ settings });
        }

        return settings;
      }

      console.debug('No settings found, creating defaults');
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
      };

      await browser.storage.local.set({ settings: defaultSettings });
      console.debug('Default settings saved');
      return defaultSettings;
    } catch (error) {
      console.error('Error accessing storage:', error);
      throw error;
    }
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    console.debug('Saving settings:', JSON.stringify(settings));

    try {
      await browser.storage.local.set({ settings });
      console.debug('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
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
      console.error('Error updating tab conversation:', error);
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
      console.error('Error updating global history:', error);
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
      console.error('Error clearing tab conversation:', error);
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
