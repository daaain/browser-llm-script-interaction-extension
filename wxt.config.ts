import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "LLM actions",
    description: "Create actions for any website using an LLM",
    permissions: ["storage", ...(browser === "chrome" ? ["sidePanel"] : [])],
    host_permissions: [
      "http://localhost:*/*",
      "https://api.openai.com/*",
      "https://api.anthropic.com/*",
    ],
    icons: {
      16: "icons/icon-16.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    // Chrome sidepanel
    ...(browser === "chrome"
      ? {
          side_panel: {
            default_path: "sidepanel.html",
          },
        }
      : {}),
    // Firefox sidebar
    ...(browser === "firefox"
      ? {
          sidebar_action: {
            default_title: "LLM Chat",
            default_panel: "sidepanel.html",
            default_icon: {
              16: "icons/icon-16.png",
              48: "icons/icon-48.png",
              128: "icons/icon-128.png",
            },
          },
        }
      : {}),
  }),
});
