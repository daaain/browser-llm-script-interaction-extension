# Browser LLM Chat Extension

A cross-browser extension that provides a simple chat interface for interacting with LLM APIs, including local models via LM Studio.

## Features

- 🌐 Cross-browser support (Chrome & Firefox)  
- 💬 Simple chat interface via sidebar/popup
- ⚙️ Configurable LLM providers (OpenAI, LM Studio, Custom)
- 💾 Persistent chat history
- 🔒 Secure API key storage
- ✅ TypeScript with full testing suite

## Development

### Setup

```sh
# Install dependencies
pnpm install

# Build for Chrome
pnpm build:chrome

# Build for Firefox  
pnpm build:firefox

# Development with hot reload
pnpm dev:chrome
pnpm dev:firefox
```

### Testing

```sh
# Run unit tests
pnpm test

# Run linting
pnpm lint

# Run E2E tests (requires built extension)
pnpm test:e2e
```

## Installation

### Chrome

1. Build the extension: `pnpm build:chrome`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/chrome` folder

### Firefox

1. Build the extension: `pnpm build:firefox`
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select the `dist/firefox/manifest.json` file

## LM Studio Integration

1. **Start LM Studio** and load a model
2. **Go to Developer tab** in LM Studio
3. **Start Server** (default: <http://localhost:1234>)
4. **Open extension settings** and select "LM Studio" provider
5. **Test connection** to verify setup
6. **Start chatting** via the sidebar (Chrome) or popup (Firefox)

### LM Studio Configuration

- **Endpoint**: `http://localhost:1234/v1/chat/completions`
- **Model**: Use any model name (e.g., "local-model")
- **API Key**: Leave blank (not required for local models)

## Architecture

```sh
src/
├── background/        # Service worker with LLM integration
├── sidebar/           # Chat interface (Chrome sidebar)  
├── settings/          # Configuration page
├── shared/            # Type definitions and utilities
└── manifest*.json     # Browser-specific manifests
```

## Browser Differences

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Chat UI | Sidebar | Popup |  
| Manifest | V3 | V2 |
| Permissions | sidePanel, storage | storage |

## API Compatibility

The extension uses OpenAI-compatible chat completions API format, supporting:

- OpenAI API
- LM Studio local server
- Any OpenAI-compatible endpoint

## License

ISC
