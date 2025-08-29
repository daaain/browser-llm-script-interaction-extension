# LLM Browser Automation Extension - Development Plan

Roadmap / TODO:

- recursive LLM scripting: have an LLM generate saveable scripts that can also call an LLM, so incorporating the alt text generator as an example would be perfect
- see chat history
- share / export individual chats
- debug log needs to be saved in the background like chat history are currently the entries get lost if there's a navigation event
- save complex function call sequence into action scripts
- remove disable tool usage setting, not worth trying to support that use case
- customisable system prompt
- tutorial / welcome screen
- handle text selection - add to context with little popup? that could also trigger opening the sidebar?
- maybe also right click context menu element selection for interaction?
- wait for active requests to finish before returning tool call results? See <https://github.com/kjleitz/active-requests>
- should deduplicateElements go the other way and move towards children?
- add tiny model for input filtering
