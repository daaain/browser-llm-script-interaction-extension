# Development Guide

This guide covers everything needed to develop, test, and contribute to the Browser LLM Chat Extension.

## Project Overview

A cross-browser extension built with WXT framework that provides a chat interface for LLM APIs, including local models via LM Studio. The extension supports Chrome (Manifest V3) and Firefox (Manifest V2).

## Technology Stack

- **Framework**: WXT (Next-gen Web Extension Framework)
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Testing**: Vitest (unit), Playwright (E2E)
- **Linting**: Biome
- **Build Targets**: Chrome MV3, Firefox MV2

## Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Chrome and/or Firefox for testing
- LM Studio (optional, for local LLM testing)

## Development Setup

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd browser-llm-script-interaction-extension

# Install dependencies
pnpm install

# Start development mode with hot reload
pnpm dev:chrome    # For Chrome development
pnpm dev:firefox   # For Firefox development
```

### Building

```bash
# Production builds
pnpm build         # Build for Chrome (default)
pnpm build:chrome  # Chrome MV3 build
pnpm build:firefox # Firefox MV2 build

# Development builds with watching
pnpm dev           # Chrome with hot reload
pnpm dev:chrome    # Chrome with hot reload  
pnpm dev:firefox   # Firefox with hot reload
```

### Loading in Browser

#### Chrome

1. Build: `pnpm build:chrome`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → Select `.output/chrome-mv3/` folder

#### Firefox

1. Build: `pnpm build:firefox`
2. Open `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `.output/firefox-mv2/manifest.json`

## Project Architecture

### Directory Structure

```
├── entrypoints/           # WXT entrypoints
│   ├── background.ts      # Service worker (handles LLM communication)
│   ├── popup/             # Main chat interface
│   │   ├── index.html     # Popup HTML
│   │   ├── index.ts       # Popup logic
│   │   └── index.css      # Popup styling
│   └── options/           # Settings/configuration page
│       ├── index.html     # Options HTML
│       ├── index.ts       # Options logic
│       └── index.css      # Options styling
├── utils/                 # Shared utilities (auto-imported by WXT)
│   ├── types.ts          # TypeScript type definitions
│   └── llm-service.ts    # LLM API integration service
├── public/               # Static assets
│   └── icons/            # Extension icons (16, 48, 128px)
├── tests/                # Test files
│   ├── unit/            # Unit tests (Vitest)
│   └── e2e/             # End-to-end tests (Playwright)
├── .output/             # Built extension files
│   ├── chrome-mv3/      # Chrome build output
│   └── firefox-mv2/     # Firefox build output
└── wxt.config.ts        # WXT configuration
```

### Key Components

#### Background Script (`entrypoints/background.ts`)

- Service worker for Chrome MV3, background script for Firefox MV2
- Handles message passing between popup/options and LLM APIs
- Manages extension settings storage
- Contains LLM service integration

#### Popup Interface (`entrypoints/popup/`)

- Main chat interface accessed via extension icon
- Displays chat history and handles user input
- Communicates with background script for LLM requests

#### Options Page (`entrypoints/options/`)

- Configuration interface for LLM providers
- Accessible via right-click extension icon → Options
- Supports multiple providers (OpenAI, LM Studio, custom endpoints)

#### Utils (`utils/`)

- `types.ts`: Shared TypeScript interfaces and types
- `llm-service.ts`: LLM API integration (OpenAI-compatible format)

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run specific test file
pnpm test llm-service.test.ts
```

### End-to-End Tests

```bash
# Run E2E tests (requires built extension)
pnpm test:e2e

# Run E2E tests with UI
pnpm test:e2e --ui

# Run E2E tests for specific browser
pnpm test:e2e --project=chrome
```

### Linting and Formatting

```bash
# Check code style
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Format code
pnpm format
```

## Browser Differences

| Aspect | Chrome | Firefox |
|--------|--------|---------|
| Manifest | V3 | V2 |
| Service Worker | Yes | Background script |
| Permissions | `host_permissions` | `permissions` |
| Build Output | `.output/chrome-mv3/` | `.output/firefox-mv2/` |
| Dev Tools | chrome://extensions/ | about:debugging |

## Configuration

### WXT Configuration (`wxt.config.ts`)

The WXT config defines:

- Extension manifest properties
- Build targets and output directories
- Development server settings

### Extension Manifest

Generated automatically by WXT based on entrypoints and config:

- Chrome: Manifest V3 with service worker
- Firefox: Manifest V2 with background scripts

## LLM Integration

### Supported Providers

1. **LM Studio** (local models)
   - Endpoint: `http://localhost:1234/v1/chat/completions`
   - No API key required
   - Best for development and privacy

2. **OpenAI API**
   - Endpoint: `https://api.openai.com/v1/chat/completions`
   - Requires API key
   - Models: GPT-4, GPT-3.5-turbo, etc.

3. **Custom Endpoints**
   - Any OpenAI-compatible API
   - Configurable endpoint and model
   - Optional API key support

### Message Format

Uses OpenAI chat completions format:

```typescript
{
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
}
```

## Adding New Features

### Adding a New Entrypoint

1. Create file in `entrypoints/` directory
2. Use appropriate WXT patterns (e.g., `defineContentScript()`)
3. WXT automatically detects and builds new entrypoints

### Adding Utilities

1. Add files to `utils/` directory
2. WXT auto-imports utilities across entrypoints
3. Update `utils/types.ts` for shared types

### Testing New Features

1. Add unit tests in `tests/unit/`
2. Add E2E tests in `tests/e2e/`
3. Ensure both Chrome and Firefox compatibility

## Debugging

### Browser DevTools

- **Chrome**: Right-click extension → "Inspect popup"
- **Firefox**: about:debugging → Extension → "Inspect"
- **Background Script**: chrome://extensions/ → Extension details → "Inspect views: service worker"

### Common Issues

1. **Build Errors**: Clear cache with `rm -rf node_modules .output && pnpm install`
2. **Extension Won't Load**: Check manifest.json syntax and permissions
3. **API Connection Failed**: Verify LM Studio server is running
4. **TypeScript Errors**: Run `pnpm typecheck` for detailed errors

### Logging

- Background script logs appear in service worker console
- Popup logs appear in popup DevTools console
- Use `console.log()` for debugging (remove in production)

## Contributing

### Code Style

- Follow existing TypeScript patterns
- Use Biome for consistent formatting
- Add JSDoc comments for public APIs
- Follow WXT conventions for entrypoints

### Pull Request Process

1. Fork and create feature branch
2. Add tests for new functionality
3. Ensure all tests pass: `pnpm test && pnpm test:e2e`
4. Update documentation if needed
5. Submit pull request with clear description

### Release Process

1. Update version in `package.json`
2. Build for both browsers: `pnpm build:chrome && pnpm build:firefox`
3. Test builds in both browsers
4. Create release with built extensions

## Performance Considerations

- Keep background script lightweight (affects startup time)
- Minimize popup bundle size for fast loading
- Use efficient storage patterns for chat history
- Consider rate limiting for API requests

## Security Notes

- API keys stored securely using extension storage API
- Content Security Policy enforced by manifest
- No eval() or unsafe inline scripts
- Validate all user inputs before API calls
