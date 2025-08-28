import { createRoot } from 'react-dom/client';
import ChatInterface from './ChatInterface';
import { ErrorBoundary } from './components/ErrorBoundary';

// Render the React app
console.log('🚀 index.tsx attempting to render React app...');
const container = document.getElementById('root');
if (container) {
  console.log('✅ Found root container, rendering React ChatInterface...');
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <ChatInterface />
    </ErrorBoundary>,
  );
} else {
  console.error('❌ No root container found for React app');
}
