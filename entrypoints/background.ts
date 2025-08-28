import browser from 'webextension-polyfill';
import { defineBackground } from 'wxt/utils/define-background';
import { backgroundLogger } from '~/utils/debug-logger';
import { messageHandler } from '~/utils/message-handler';
import type { ExtendedBrowser, MessageFromSidebar } from '~/utils/types';

/**
 * Background Script
 *
 * This background script handles message passing and browser extension setup.
 */
export default defineBackground({
  persistent: true,
  main() {
    backgroundLogger.debug('Background script starting...');

    const extendedBrowser = browser as ExtendedBrowser;
    if (extendedBrowser.sidePanel) {
      backgroundLogger.debug('Chrome: Setting up sidePanel');
      extendedBrowser.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error: unknown) =>
          backgroundLogger.error('Error setting panel behavior', { error }),
        );
    }

    if (browser.sidebarAction) {
      backgroundLogger.debug('Firefox: Setting up sidebarAction');
      browser.browserAction.onClicked.addListener(async () => {
        try {
          await browser.sidebarAction.open();
        } catch (error) {
          backgroundLogger.error('Error opening sidebar', { error });
        }
      });
    }

    backgroundLogger.debug('Setting up message listener...');
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      backgroundLogger.debug('Background script received message', {
        messageType: (message as MessageFromSidebar)?.type,
      });

      // Handle async message processing
      (async () => {
        try {
          await messageHandler.handleMessage(message, sendResponse);
        } catch (error) {
          backgroundLogger.error('Background script message handling error', {
            error: error instanceof Error ? error.message : error,
          });
          sendResponse({
            type: 'ERROR',
            payload: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
        }
      })();

      return true; // Keep message channel open for async response
    });

    backgroundLogger.debug('Background service worker loaded');

    // Log service info on startup
    (async () => {
      try {
        const serviceInfo = await messageHandler.getServiceInfo();
        backgroundLogger.info('🚀 Service Info', { serviceInfo });
      } catch (error) {
        backgroundLogger.error('Error getting service info', { error });
      }
    })();
  },
});
