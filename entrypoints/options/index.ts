import browser from "webextension-polyfill";
import type { ExtensionSettings, MessageFromSidebar, MessageToSidebar } from "~/utils/types";
import { DEFAULT_PROVIDERS } from "~/utils/types";
import { DEFAULT_TRUNCATION_LIMIT } from "~/utils/constants";

class SettingsManager {
  private currentSettings: ExtensionSettings | null = null;
  private autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadSettings();
    this.populateProviderSelect();
    this.setupEventListeners();
  }

  private async loadSettings() {
    console.debug("Loading settings...");

    const message: MessageFromSidebar = {
      type: "GET_SETTINGS",
      payload: null,
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;
      console.debug("Settings response:", JSON.stringify(response));

      if (response.type === "SETTINGS_RESPONSE") {
        this.currentSettings = response.payload;
        this.populateForm();
        console.debug("Settings loaded successfully");
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
    (document.getElementById("debug-mode") as HTMLInputElement).checked =
      this.currentSettings.debugMode || false;
    (document.getElementById("tools-enabled") as HTMLInputElement).checked =
      this.currentSettings.toolsEnabled || false;
    (document.getElementById("truncation-limit-input") as HTMLInputElement).value =
      this.currentSettings.truncationLimit?.toString() || DEFAULT_TRUNCATION_LIMIT.toString();
  }

  private setupEventListeners() {
    const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
    const endpointInput = document.getElementById("endpoint-input") as HTMLInputElement;
    const modelInput = document.getElementById("model-input") as HTMLInputElement;
    const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
    const truncationLimitInput = document.getElementById("truncation-limit-input") as HTMLInputElement;
    const testButton = document.getElementById("test-connection") as HTMLButtonElement;
    const clearHistoryButton = document.getElementById("clear-history") as HTMLButtonElement;

    providerSelect.addEventListener("change", () => {
      const selectedIndex = parseInt(providerSelect.value, 10);
      if (selectedIndex >= 0 && selectedIndex < DEFAULT_PROVIDERS.length) {
        const provider = DEFAULT_PROVIDERS[selectedIndex];
        endpointInput.value = provider.endpoint;
        modelInput.value = provider.model;
      }
      this.autoSave();
    });

    // Auto-save on input changes
    endpointInput.addEventListener("input", () => this.autoSave());
    modelInput.addEventListener("input", () => this.autoSave());
    apiKeyInput.addEventListener("input", () => this.autoSave());
    truncationLimitInput.addEventListener("input", () => this.autoSave());
    
    // Auto-save for checkboxes
    const debugModeCheckbox = document.getElementById("debug-mode") as HTMLInputElement;
    const toolsEnabledCheckbox = document.getElementById("tools-enabled") as HTMLInputElement;
    debugModeCheckbox.addEventListener("change", () => this.autoSave());
    toolsEnabledCheckbox.addEventListener("change", () => this.autoSave());

    testButton.addEventListener("click", () => this.testConnection());
    clearHistoryButton.addEventListener("click", () => this.clearHistory());
  }


  private autoSave() {
    // Clear existing timeout to debounce rapid changes
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Auto-save after 1 second of no changes
    this.autoSaveTimeout = setTimeout(() => {
      this.saveSettingsQuietly();
    }, 1000);
  }

  private async saveSettingsQuietly() {
    try {
      const endpoint = (document.getElementById("endpoint-input") as HTMLInputElement).value;
      const model = (document.getElementById("model-input") as HTMLInputElement).value;
      const apiKey = (document.getElementById("api-key-input") as HTMLInputElement).value;
      const debugMode = (document.getElementById("debug-mode") as HTMLInputElement).checked;
      const toolsEnabled = (document.getElementById("tools-enabled") as HTMLInputElement).checked;
      const truncationLimit = parseInt((document.getElementById("truncation-limit-input") as HTMLInputElement).value, 10) || DEFAULT_TRUNCATION_LIMIT;

      // Don't auto-save if required fields are empty
      if (!endpoint || !model) {
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
        debugMode,
        toolsEnabled,
        truncationLimit,
      };

      const message: MessageFromSidebar = {
        type: "SAVE_SETTINGS",
        payload: updatedSettings,
      };

      await browser.runtime.sendMessage(message);
      this.currentSettings = updatedSettings;
    } catch (error) {
      console.error("Error auto-saving settings:", error);
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
