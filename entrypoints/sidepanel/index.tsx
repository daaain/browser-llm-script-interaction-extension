import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatInterface from './ChatInterface';

// Render the React app
console.log('🚀 index.tsx attempting to render React app...');
const container = document.getElementById('root');
if (container) {
  console.log('✅ Found root container, rendering React ChatInterface...');
  const root = createRoot(container);
  root.render(<ChatInterface />);
} else {
  console.error('❌ No root container found for React app');
}
