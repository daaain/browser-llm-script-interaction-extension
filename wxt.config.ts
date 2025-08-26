import { defineConfig } from 'wxt';

export default defineConfig({
  webExt: {
    firefoxPrefs: { 'datareporting.policy.firstRunURL': '' },
  },
  vite: () => ({
    base: './',
    server: {
      port: 3000,
    },
    publicDir: 'public',
  }),
  manifest: ({ browser }) => ({
    name: 'LLM actions',
    description: 'Create actions for any website using an LLM',
    permissions: ['storage', 'activeTab', 'tabs', ...(browser === 'chrome' ? ['sidePanel'] : [])],
    host_permissions: [
      'http://localhost:*/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
    ],
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    // Chrome sidepanel
    ...(browser === 'chrome'
      ? {
          side_panel: {
            default_path: 'sidepanel.html',
          },
        }
      : {}),
    // Firefox sidebar and background
    ...(browser === 'firefox'
      ? {
          sidebar_action: {
            default_title: 'LLM Chat',
            default_panel: 'sidepanel.html',
            default_icon: {
              16: 'icons/icon-16.png',
              48: 'icons/icon-48.png',
              128: 'icons/icon-128.png',
            },
          },
        }
      : {}),
  }),
});
