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

### Key Components

#### Background Script (`entrypoints/background.ts`)

- Service worker for Chrome MV3, background script for Firefox MV2
- Handles message passing between sidepanel/options and LLM APIs
- Manages extension settings storage
- Contains LLM service integration

#### Sidepanel Interface (`entrypoints/sidepanel/`)

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
pnpm build && pnpm test:e2e

# Run E2E tests with UI
pnpm test:e2e --ui

# Run E2E tests for specific browser
pnpm test:e2e --project=chrome

# Run just the test which does real LLM API calls (and captures JSON responses):
pnpm test:e2e tests/e2e/manual-streaming-test.spec.ts
```

The comprehensive test suite includes:

- **Multi-round tool calling validation** - Verifies multiple API calls with tool usage
- **Real LLM integration testing** - Tests actual tool execution with screenshot, click, and type tools
- **UI state management** - Validates streaming indicators, message rendering, and form interactions
- **Cross-browser compatibility** - Chrome MV3 and Firefox MV2 support
- **Settings persistence** - Configuration save/load across page reloads

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

1. **LM Studio** (local models) - **Default**
   - Endpoint: `http://localhost:1234/v1/chat/completions`
   - No API key required
   - Best for development and privacy
   - **Recommended**: Use tool-capable models like Qwen3-Coder-30B for full functionality

2. **OpenAI API**
   - Endpoint: `https://api.openai.com/v1/chat/completions`
   - Requires API key
   - Models: GPT-4, GPT-3.5-turbo, etc.

3. **Custom Endpoints**
   - Any OpenAI-compatible API
   - Configurable endpoint and model
   - Optional API key support

### Tool Integration

**Tools are enabled by default** and include:

- `screenshot` - Capture current page
- `click` - Click on page elements
- `type` - Enter text in form fields
- `find` - Locate elements on the page

Tools use content script injection for cross-page functionality.

### Message Format

Uses OpenAI chat completions format with tool support:

```typescript
{
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | MessageContent;
    tool_calls?: LLMToolCall[];
    tool_call_id?: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: JSONSchema;
    };
  }>;
  max_tokens?: number;
  temperature?: number; // Default: 0.1 for consistency
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

- **Chrome**: Right-click extension → "Inspect sidepanel"
- **Firefox**: about:debugging → Extension → "Inspect"
- **Background Script**: chrome://extensions/ → Extension details → "Inspect views: service worker"

### Common Issues

1. **Build Errors**: Clear cache with `rm -rf node_modules .output && pnpm install`
2. **Extension Won't Load**: Check manifest.json syntax and permissions
3. **API Connection Failed**: Verify LM Studio server is running
4. **TypeScript Errors**: Run `pnpm typecheck` for detailed errors
5. **E2E Test Failures**:
   - Ensure LM Studio is running with a tool-capable model (e.g., Qwen3-Coder-30B)
   - Check that tools are enabled by default in settings
   - Verify temperature is set to 0.1 for consistent results
   - Tests expect multiple tool calls for comprehensive validation

### Debug Logging System

The extension features a comprehensive debug logging system that works across all contexts (background, sidepanel, content scripts, options).

#### Using the Debug Logger

```typescript
// Import the logger
import { backgroundLogger, sidepanelLogger, contentLogger, optionsLogger } from '~/utils/debug-logger';
// Or use the context-aware logger
import { getContextLogger } from '~/utils/debug-logger';

// Use the appropriate logger for your context
const logger = backgroundLogger; // or getContextLogger() for automatic detection

// Log at different levels
logger.debug('Debug information', { data: 'example' });
logger.info('Information message', { userId: 123 });
logger.warn('Warning message', { issue: 'performance' });
logger.error('Error occurred', new Error('Something went wrong')); // Automatically captures stack traces
```

#### Viewing Debug Logs

1. **In Sidepanel**: Click the debug icon (🐛) in the header to open the debug log viewer
2. **In DevTools**: Logs also appear in the browser console for immediate debugging
3. **Export Logs**: Use the export button in the debug viewer to save logs as JSON

#### Debug Viewer Features

- **Real-time filtering** by log level (debug, info, warn, error)
- **Context filtering** by source (background, sidepanel, content, options)
- **Text search** through log messages and data
- **Time-based filtering** (last hour, last 10 minutes, all time)
- **Auto-refresh** for live log monitoring
- **Export functionality** for sharing or analysis

#### Configuration

- **Max Log Entries**: Configurable limit (default: 10,000 entries)
- **Auto-pruning**: Old entries are automatically removed when limit is exceeded
- **Persistent Storage**: Logs survive extension restarts and browser sessions

#### Performance Considerations

- Logs are stored efficiently using chunked storage
- Only recent entries are kept in memory
- Background logging has minimal performance impact
- Type validation ensures data integrity

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
4. Run linting and type checking: `pnpm lint && pnpm typecheck`
5. Update documentation if needed
6. Submit pull request with clear description

**Testing Requirements**:

- Unit tests for new utilities and services
- E2E tests for UI changes and tool functionality
- Multi-round tool calling validation for complex features
- Cross-browser compatibility verification

### Release Process

1. Update version in `package.json`
2. Build for both browsers: `pnpm build:chrome && pnpm build:firefox`
3. Test builds in both browsers
4. Create release with built extensions

## Performance Considerations

- Keep background script lightweight (affects startup time)
- Minimize sidepanel bundle size for fast loading
- Use efficient storage patterns for chat history
- Consider rate limiting for API requests

## Security Notes

- API keys stored securely using extension storage API
- Content Security Policy enforced by manifest
- No eval() or unsafe inline scripts
- Validate all user inputs before API calls
