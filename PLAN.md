# LLM Browser Automation Extension - Development Plan

NOTE: please use this as an initial plan to set the direction, but you don't have to take everything verbatim.

## Overview

A browser extension that enables LLMs to interact with web pages through a lightweight API, using a persistent sidebar for chat interaction and supporting multiple LLM providers through OpenAI-compatible APIs with tool use.

## Architecture

### Core Components

1. **Manifest (manifest.json)**
   - Manifest V3 for modern browser compatibility
   - Permissions: `activeTab`, `scripting`, `storage`, `sidePanel`
   - Content script injection on all URLs (or specific domains)

2. **Content Script (content.js)**
   - Injected into target pages
   - Creates a global `LLMHelper` object with automation functions
   - Communicates with sidebar via Chrome runtime messaging
   - Returns concise, structured text responses

3. **Background Service Worker (background.js)**
   - Manages extension lifecycle
   - Routes messages between content script and sidebar
   - Handles LLM API calls
   - Manages tool definitions

4. **Sidebar Interface (sidebar.html/js)**
   - Persistent chat interface
   - Shows conversation history
   - Displays function calls and results in real-time
   - Settings access button

5. **Settings Page (settings.html/js)**
   - LLM provider configuration
   - API endpoint and key management
   - Preset selection from bundled configurations
   - Tool definition customisation

## LLMHelper API Design

### Core Philosophy

- **Concise Returns**: Never return full HTML; always return structured summaries
- **Smart Defaults**: Assume common patterns (e.g., clickable = buttons/links)
- **Regex-First**: Use text patterns for finding elements
- **Stateful References**: Store found elements by ID for reuse
- **Tool-Compatible**: Each function designed for LLM tool use

### Essential Functions

```javascript
// Discovery Functions
LLMHelper.find(pattern, options = {})
// Returns: [{id: 1, text: "Download", tag: "button", classes: "btn-primary"}]
// Options: {limit: 10, type: 'button|link|input|*', visible: true}

LLMHelper.findNear(refId, pattern, options = {})
// Searches near a previously found element
// Returns: Similar to find() but relative to reference

LLMHelper.describe(selector)
// Returns structured description of page section
// e.g., "Table with 5 columns: Name, Date, Size, Type, Actions. 24 rows visible."

// Interaction Functions
LLMHelper.click(elementId)
// Clicks stored element reference
// Returns: "Clicked: [element description]"

LLMHelper.rightClick(elementId)
// Triggers context menu
// Returns: "Context menu opened at: [element]"

LLMHelper.type(elementId, text, options = {})
// Types into input/textarea
// Options: {clear: true, submit: false}
// Returns: "Typed into: [element]"

LLMHelper.select(elementId, value)
// Selects dropdown option
// Returns: "Selected: [value] in [element]"

// Navigation Functions
LLMHelper.waitFor(pattern, timeout = 5000)
// Waits for element matching pattern
// Returns: "Found: [element]" or "Timeout waiting for: [pattern]"

LLMHelper.getMenuItems()
// After context menu opens, gets available options
// Returns: ["Download", "Open in new tab", "Copy link"]

LLMHelper.clickMenuItem(pattern)
// Clicks context menu item matching pattern
// Returns: "Clicked menu item: [item]"

// Utility Functions
LLMHelper.extract(elementId, property)
// Gets specific property without full element dump
// Properties: 'href', 'value', 'data-*', 'innerText'
// Returns: Requested property value only

LLMHelper.runJS(code)
// Executes arbitrary JavaScript
// Returns: Serialised result (with size limit)

LLMHelper.summary()
// Returns page overview
// e.g., "Page: Document Library. 24 documents listed. Filters: Date, Type. Actions available: Download, Share, Delete"

LLMHelper.clear()
// Clears stored element references
// Returns: "References cleared"
```

## LLM Integration Architecture

### Tool Definition System

```javascript
// toolGenerator.js
class ToolDefinitionGenerator {
  constructor() {
    this.functions = {
      find: {
        description: "Find elements on the page matching a text pattern",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Regex pattern to match element text"
            },
            options: {
              type: "object",
              properties: {
                limit: { type: "integer", description: "Max results to return" },
                type: { type: "string", enum: ["button", "link", "input", "*"] },
                visible: { type: "boolean", description: "Only visible elements" }
              }
            }
          },
          required: ["pattern"]
        }
      },
      click: {
        description: "Click on a previously found element",
        parameters: {
          type: "object",
          properties: {
            elementId: {
              type: "integer",
              description: "ID of element from find() results"
            }
          },
          required: ["elementId"]
        }
      },
      // ... other function definitions
    };
  }
  
  generateForProvider(provider) {
    // Generate tool definitions in provider-specific format
    if (provider === 'openai' || provider === 'anthropic') {
      return Object.entries(this.functions).map(([name, def]) => ({
        type: "function",
        function: {
          name: `browser_${name}`,
          description: def.description,
          parameters: def.parameters
        }
      }));
    }
    // Other provider formats...
  }
}
```

### Message Flow

```javascript
// Background.js - LLM Communication
class LLMConnector {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.tools = new ToolDefinitionGenerator().generateForProvider(config.provider);
  }
  
  async sendMessage(message, conversationHistory) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [...conversationHistory, { role: 'user', content: message }],
        tools: this.tools,
        tool_choice: 'auto'
      })
    });
    
    const data = await response.json();
    
    // Process tool calls
    if (data.choices[0].message.tool_calls) {
      const toolResults = await this.executeTools(data.choices[0].message.tool_calls);
      // Continue conversation with tool results
      return this.sendMessage(null, [
        ...conversationHistory,
        { role: 'user', content: message },
        data.choices[0].message,
        { role: 'tool', content: toolResults }
      ]);
    }
    
    return data.choices[0].message.content;
  }
  
  async executeTools(toolCalls) {
    const results = [];
    for (const call of toolCalls) {
      const functionName = call.function.name.replace('browser_', '');
      const args = JSON.parse(call.function.arguments);
      
      // Send to content script
      const result = await chrome.tabs.sendMessage(activeTabId, {
        type: 'EXECUTE_FUNCTION',
        function: functionName,
        arguments: args
      });
      
      results.push({
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
    return results;
  }
}
```

### Content Script Communication

```javascript
// content.js
(function() {
  const elementStore = new Map();
  let nextId = 1;
  
  const LLMHelper = {
    find(pattern, options = {}) {
      const regex = new RegExp(pattern, 'i');
      const candidates = document.querySelectorAll(
        options.type === '*' ? '*' : options.type || 'button, a, input'
      );
      
      return Array.from(candidates)
        .filter(el => {
          const text = el.innerText || el.value || el.placeholder || '';
          return regex.test(text) && (!options.visible || isVisible(el));
        })
        .slice(0, options.limit || 10)
        .map(el => ({
          id: storeElement(el),
          text: truncate(el.innerText || el.value, 50),
          tag: el.tagName.toLowerCase(),
          classes: el.className.split(' ').slice(0, 3).join(' ')
        }));
    },
    // ... other methods
  };
  
  function storeElement(el) {
    const id = nextId++;
    elementStore.set(id, el);
    // Auto-cleanup after 5 minutes
    setTimeout(() => elementStore.delete(id), 5 * 60 * 1000);
    return id;
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_FUNCTION') {
      try {
        const result = LLMHelper[request.function](...Object.values(request.arguments));
        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    return true; // Keep channel open for async response
  });
})();
```

## Configuration System

### Provider Presets (providers.json)

```json
{
  "providers": {
    "openai": {
      "name": "OpenAI",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "models": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
      "requiresApiKey": true,
      "toolFormat": "openai"
    },
    "anthropic": {
      "name": "Anthropic Claude",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "models": ["claude-3-opus", "claude-3-sonnet"],
      "requiresApiKey": true,
      "toolFormat": "anthropic",
      "headers": {
        "anthropic-version": "2023-06-01"
      }
    },
    "local": {
      "name": "Local LLM (OpenAI Compatible)",
      "endpoint": "http://localhost:11434/v1/chat/completions",
      "models": [],
      "requiresApiKey": false,
      "toolFormat": "openai"
    },
    "custom": {
      "name": "Custom Endpoint",
      "endpoint": "",
      "models": [],
      "requiresApiKey": true,
      "toolFormat": "openai"
    }
  }
}
```

### Settings Interface Structure

```javascript
// settings.js
class SettingsManager {
  constructor() {
    this.loadProviders();
    this.loadSavedConfig();
  }
  
  async loadProviders() {
    const response = await fetch(chrome.runtime.getURL('providers.json'));
    this.providers = await response.json();
  }
  
  renderProviderSelect() {
    // Dropdown with provider presets
    // When selected, populate endpoint and model fields
    // Show/hide API key field based on requiresApiKey
  }
  
  testConnection() {
    // Send test message to verify configuration
  }
  
  saveConfig() {
    chrome.storage.sync.set({
      llmConfig: {
        provider: this.selectedProvider,
        endpoint: this.endpoint,
        apiKey: this.apiKey, // Encrypted
        model: this.model
      }
    });
  }
}
```

## Sidebar Chat Interface

### HTML Structure (sidebar.html)

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="sidebar.css">
</head>
<body>
  <div class="chat-container">
    <div class="header">
      <h3>Browser Assistant</h3>
      <button id="settings-btn">⚙️</button>
    </div>
    
    <div class="messages" id="messages">
      <!-- Message bubbles appear here -->
    </div>
    
    <div class="status" id="status">
      <!-- Shows current operation: "Finding elements...", "Clicking button..." -->
    </div>
    
    <div class="input-area">
      <textarea id="user-input" placeholder="Describe what you want to do..."></textarea>
      <button id="send-btn">Send</button>
    </div>
  </div>
  
  <script src="sidebar.js"></script>
</body>
</html>
```

### Sidebar Controller (sidebar.js)

```javascript
class SidebarController {
  constructor() {
    this.messages = [];
    this.initEventListeners();
    this.connectToBackground();
  }
  
  addMessage(role, content, toolCall = null) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    
    if (toolCall) {
      // Show function call in a special format
      messageEl.innerHTML = `
        <div class="tool-call">
          <span class="function-name">${toolCall.function}</span>
          <pre class="function-args">${JSON.stringify(toolCall.arguments, null, 2)}</pre>
          <div class="function-result">${toolCall.result || 'Executing...'}</div>
        </div>
      `;
    } else {
      messageEl.textContent = content;
    }
    
    document.getElementById('messages').appendChild(messageEl);
  }
  
  updateStatus(status) {
    document.getElementById('status').textContent = status;
  }
  
  async sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value;
    input.value = '';
    
    this.addMessage('user', message);
    this.updateStatus('Thinking...');
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'CHAT_MESSAGE',
      message: message
    });
  }
}
```

## Usage Flow

1. **User opens sidebar** on a page with documents
2. **User types**: "Download all invoices from 2024"
3. **LLM receives** message with tool definitions
4. **LLM responds** with tool calls:

   ```json
   {
     "tool_calls": [
       {
         "function": "browser_summary",
         "arguments": {}
       }
     ]
   }
   ```

5. **Extension executes** `LLMHelper.summary()` on the page
6. **Returns**: "Page: Document Library. 24 documents. Types: Invoice, Receipt, Report"
7. **LLM continues** with:

   ```json
   {
     "tool_calls": [
       {
         "function": "browser_find",
         "arguments": {
           "pattern": "Invoice.*2024",
           "options": { "type": "*" }
         }
       }
     ]
   }
   ```

8. **Process continues** with right-click, menu selection, etc.

## Development Phases

### Phase 1: Core Infrastructure

- Basic manifest with sidebar
- Content script with LLMHelper functions
- Message passing between components
- Simple test without LLM (manual function calls)

### Phase 2: LLM Integration

- Settings page with provider configuration
- Tool definition generator
- OpenAI-compatible API integration
- Tool execution pipeline

### Phase 3: UI Polish

- Styled sidebar with message bubbles
- Function call visualisation
- Status indicators and progress
- Error handling and recovery

### Phase 4: Advanced Features

- Conversation history persistence
- Multiple chat sessions
- Export/import configurations
- Batch operations support

### Phase 5: Provider Extensions

- Anthropic-specific formatting
- Local LLM support (Ollama, etc.)
- Streaming responses
- Custom tool definitions per site

## File Structure

```
extension/
├── manifest.json
├── content.js
├── background.js
├── sidebar.html
├── sidebar.js
├── sidebar.css
├── settings.html
├── settings.js
├── settings.css
├── toolGenerator.js
├── providers.json
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Security Considerations

1. **API Key Storage**: Encrypt keys in chrome.storage
2. **Content Security Policy**: Handle CSP restrictions
3. **Sanitisation**: Validate all inputs and patterns
4. **Rate Limiting**: Prevent excessive API calls
5. **Origin Validation**: Ensure messages come from extension only

This architecture provides a complete LLM-powered browser automation system with provider flexibility and a clean chat interface for monitoring operations in real-time.
