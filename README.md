# Browser LLM Action Extension

**Fair warning: this is currently an early prototype and it's not published as a properly built extension yet, but I'm sharing this early build as it's already working as a proof-of-concept when running in development. Chrome only for now.**

**Security notice: There's currently no specific prompt injection attack mitigation implemented. The extension doesn't automatically read all content of websites, only in small bits through tool calls. So it starts out with absolutely no information on what you have open and will explore based on your instructions. DO NOT use it in your main browser with logged in sessions, please only test in a separate installation like Chrome Canary. For more information why is this a serious concern, read [Simon Willison's blog post summing up Anthropic's research](https://simonwillison.net/2025/Aug/26/piloting-claude-for-chrome/).**

A cross-browser extension that provides a simple chat interface for LLMs (including local models) to interact with web pages.

Real-time demo using qwen/qwen3-coder-30b MLX 6bit running on an M2 Max MBP:

https://github.com/user-attachments/assets/7a584180-e8dd-4c7f-838a-efd051fa2968

## Features

- 🌐 Cross-browser support (Chrome & Firefox (soon))  
- 💬 Simple chat interface via sidepanel
- ⚙️ Configurable LLM providers (OpenAI, LM Studio, Custom)
- 💾 Persistent chat history
- 🛠️ Javascript tools returning minimal responses to keep context small

## Quick Start

Ready-to-use extension builds are available in the releases section. For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).

If you want to see a quick demo, go to Google.com and type `click Reject All, search fluffy robots, and tell me which 3 are the most popular`

## Installation

### Chrome Installation

```sh
pnpm install
pnpm dev:chrome
```

This should install dependencies, build the extension, and launch Chrome in extension development mode.

## Configuration

### Initial Setup

1. **Open Settings**:
   - Click the gear icon (⚙️) in the extension sidepanel
   - Or right-click the extension icon → Options

2. **Start LM Studio**:
   - Launch LM Studio application
   - Load a chat model
   - Go to Developer tab
   - Start the local server (should show green indicator)

3. **Configure LM Studio** (recommended for local models):
   - Select "LM Studio" from the provider dropdown
   - Endpoint: `http://localhost:1234/v1/chat/completions` (default)
   - Model: Enter model API identifier (e.g., "qwen/qwen3-coder-30b")
   - API Key: Leave blank
   - Click "Test Connection" to verify
   - Click "Save Settings"

4. **Start Chatting**:
   - Open the extension sidepanel
   - Type your message and press Enter
   - The extension will communicate with your local LLM and interact with the open tab (each tab will have its own session)

### Alternative Providers

You can also configure:

- **OpenAI API**: Requires API key
- **Custom endpoints**: Any OpenAI-compatible API

## Troubleshooting

- **Extension won't load**: Check browser console for errors
- **Can't connect to LM Studio**: Ensure server is running on localhost:1234
- **No response from LLM**: Check LM Studio logs and network requests in DevTools
- **Permissions issues**: Make sure developer mode is enabled

## Development

For development setup, testing, and contribution guidelines, see [DEVELOPMENT.md](DEVELOPMENT.md).

## API Compatibility

The extension uses Vercel AI SDK and currently implements OpenAI-compatible chat completions API format, supporting:

- OpenAI API
- LM Studio local server
- Any OpenAI-compatible endpoint

## License

MIT
