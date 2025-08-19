import browser from "webextension-polyfill";
import type { ExtensionSettings, MessageFromSidebar, MessageToSidebar } from "~/utils/types";
import { DEFAULT_PROVIDERS } from "~/utils/types";

class SettingsManager {
  private currentSettings: ExtensionSettings | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadSettings();
    this.populateProviderSelect();
    this.setupEventListeners();
  }

  private async loadSettings() {
    console.log("Loading settings...");

    const message: MessageFromSidebar = {
      type: "GET_SETTINGS",
      payload: null,
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;
      console.log("Settings response:", response);

      if (response.type === "SETTINGS_RESPONSE") {
        this.currentSettings = response.payload;
        this.populateForm();
        console.log("Settings loaded successfully");
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showMessage("Error loading settings. Please try refreshing.", "error");
    }
  }

  private populateProviderSelect() {
    const select = document.getElementById("provider-select") as HTMLSelectElement;

    DEFAULT_PROVIDERS.forEach((provider, index) => {
      const option = document.createElement("option");
      option.value = index.toString();
      option.textContent = provider.name;
      select.appendChild(option);
    });
  }

  private populateForm() {
    if (!this.currentSettings) return;

    const providerIndex = DEFAULT_PROVIDERS.findIndex(
      (p) => p.endpoint === this.currentSettings?.provider.endpoint,
    );

    if (providerIndex !== -1) {
      (document.getElementById("provider-select") as HTMLSelectElement).value =
        providerIndex.toString();
    }

    (document.getElementById("endpoint-input") as HTMLInputElement).value =
      this.currentSettings.provider.endpoint;
    (document.getElementById("model-input") as HTMLInputElement).value =
      this.currentSettings.provider.model;
    (document.getElementById("api-key-input") as HTMLInputElement).value =
      this.currentSettings.provider.apiKey || "";
  }

  private setupEventListeners() {
    const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
    const endpointInput = document.getElementById("endpoint-input") as HTMLInputElement;
    const modelInput = document.getElementById("model-input") as HTMLInputElement;
    const saveButton = document.getElementById("save-settings") as HTMLButtonElement;
    const testButton = document.getElementById("test-connection") as HTMLButtonElement;
    const clearHistoryButton = document.getElementById("clear-history") as HTMLButtonElement;

    providerSelect.addEventListener("change", () => {
      const selectedIndex = parseInt(providerSelect.value, 10);
      if (selectedIndex >= 0 && selectedIndex < DEFAULT_PROVIDERS.length) {
        const provider = DEFAULT_PROVIDERS[selectedIndex];
        endpointInput.value = provider.endpoint;
        modelInput.value = provider.model;
      }
    });

    saveButton.addEventListener("click", () => this.saveSettings());
    testButton.addEventListener("click", () => this.testConnection());
    clearHistoryButton.addEventListener("click", () => this.clearHistory());
  }

  private async saveSettings() {
    const endpoint = (document.getElementById("endpoint-input") as HTMLInputElement).value;
    const model = (document.getElementById("model-input") as HTMLInputElement).value;
    const apiKey = (document.getElementById("api-key-input") as HTMLInputElement).value;

    if (!endpoint || !model) {
      this.showMessage("Please fill in all required fields", "error");
      return;
    }

    const updatedSettings: ExtensionSettings = {
      ...this.currentSettings!,
      provider: {
        name: "Custom",
        endpoint,
        model,
        apiKey: apiKey || undefined,
      },
    };

    const message: MessageFromSidebar = {
      type: "SAVE_SETTINGS",
      payload: updatedSettings,
    };

    try {
      await browser.runtime.sendMessage(message);
      this.currentSettings = updatedSettings;
      this.showMessage("Settings saved successfully!", "success");
    } catch (error) {
      console.error("Error saving settings:", error);
      this.showMessage("Error saving settings. Please try again.", "error");
    }
  }

  private async testConnection() {
    this.showMessage("Testing connection...", "info");

    const endpoint = (document.getElementById("endpoint-input") as HTMLInputElement).value;
    const model = (document.getElementById("model-input") as HTMLInputElement).value;
    const apiKey = (document.getElementById("api-key-input") as HTMLInputElement).value;

    if (!endpoint || !model) {
      this.showMessage("Please fill in endpoint and model fields first", "error");
      return;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 10,
          stream: false,
        }),
        mode: "cors",
      });

      if (response.ok) {
        this.showMessage("Connection test successful!", "success");
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      this.showMessage(
        `Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  private async clearHistory() {
    if (!this.currentSettings) return;

    const updatedSettings: ExtensionSettings = {
      ...this.currentSettings,
      chatHistory: [],
    };

    const message: MessageFromSidebar = {
      type: "SAVE_SETTINGS",
      payload: updatedSettings,
    };

    try {
      await browser.runtime.sendMessage(message);
      this.currentSettings = updatedSettings;
      this.showMessage("Chat history cleared successfully!", "success");
    } catch (error) {
      console.error("Error clearing history:", error);
      this.showMessage("Error clearing history. Please try again.", "error");
    }
  }

  private showMessage(text: string, type: "success" | "error" | "info") {
    const statusElement = document.getElementById("status-message") as HTMLDivElement;
    statusElement.textContent = text;
    statusElement.className = `status-message ${type}`;

    setTimeout(() => {
      statusElement.style.display = "none";
      statusElement.className = "status-message";
    }, 5000);
  }
}

new SettingsManager();
