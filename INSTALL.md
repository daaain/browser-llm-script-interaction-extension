# Installation Guide

## Chrome Installation

1. **Build the extension**:

   ```bash
   pnpm build:chrome
   ```

2. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist/chrome` folder
   - The extension should now appear in your extensions list

3. **Access the extension**:
   - Click the extension icon in the toolbar to open the popup
   - Or go to Settings → Extensions to configure

## Development Mode (Chrome)

For development with hot reload:

```bash
pnpm dev:chrome
```

This builds the extension in watch mode. Reload the extension in Chrome after code changes.

## Firefox Installation

1. **Build the extension**:

   ```bash
   pnpm build:firefox
   ```

2. **Load in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on..."
   - Navigate to the `dist/firefox` folder and select `manifest.json`
   - The extension should now appear in your add-ons list
   - **Note**: Firefox will show permissions including storage access

3. **Access the extension**:
   - Click the extension icon in the toolbar to open the popup
   - Or go to Add-ons Manager to configure

## Development Mode (Firefox)

For development with hot reload:

```bash
pnpm dev:firefox
```

This builds the extension in watch mode. Reload the extension in Firefox after code changes.

## Configuration

1. **Open Settings**:
   - Click the gear icon (⚙️) in the extension interface
   - Or right-click the extension icon → Options

2. **Configure LM Studio**:
   - Select "LM Studio" from the provider dropdown
   - Endpoint: `http://localhost:1234/v1/chat/completions` (default)
   - Model: Enter any name (e.g., "local-model")
   - API Key: Leave blank
   - Click "Test Connection" to verify
   - Click "Save Settings"

3. **Start LM Studio**:
   - Launch LM Studio application
   - Load a chat model
   - Go to Developer tab
   - Start the local server (should show green indicator)

4. **Start Chatting**:
   - Open the extension interface
   - Type your message and press Enter
   - The extension will communicate with your local LLM

## Troubleshooting

- **Extension won't load**: Check browser console for errors
- **Can't connect to LM Studio**: Ensure server is running on localhost:1234
- **No response from LLM**: Check LM Studio logs and network requests
- **Permissions issues**: Make sure developer mode is enabled
