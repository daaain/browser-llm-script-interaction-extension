import { describe, expect, it } from 'vitest';
import {
  extractToolsMetadata,
  getToolMetadata,
  validateToolArguments,
} from '../../utils/tool-metadata-extractor';

describe('Tool Metadata Extractor', () => {
  describe('extractToolsMetadata', () => {
    it('should extract metadata from all available tools', () => {
      const metadata = extractToolsMetadata();

      // Should have multiple tools
      expect(metadata.length).toBeGreaterThan(0);

      // Each tool should have required properties
      metadata.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(Array.isArray(tool.parameters)).toBe(true);
      });
    });

    it('should extract tool names that match available tools', () => {
      const metadata = extractToolsMetadata();
      const toolNames = metadata.map((tool) => tool.name);

      // Should include expected tools
      expect(toolNames).toContain('screenshot');
      expect(toolNames).toContain('find');
      expect(toolNames).toContain('extract');
      expect(toolNames).toContain('summary');
      expect(toolNames).toContain('click');
      expect(toolNames).toContain('type');
    });

    it('should extract parameter information correctly', () => {
      const metadata = extractToolsMetadata();

      // Find the screenshot tool
      const screenshotTool = metadata.find((tool) => tool.name === 'screenshot');
      expect(screenshotTool).toBeDefined();

      // Should have fullPage parameter
      const fullPageParam = screenshotTool?.parameters.find((param) => param.name === 'fullPage');
      expect(fullPageParam).toBeDefined();
      expect(fullPageParam?.type).toBe('boolean');
      expect(fullPageParam?.required).toBe(false); // Should be optional
      expect(fullPageParam?.defaultValue).toBe(false);
    });

    it('should handle nested object parameters', () => {
      const metadata = extractToolsMetadata();

      // Find a tool with nested parameters (like find tool with options)
      const findTool = metadata.find((tool) => tool.name === 'find');
      expect(findTool).toBeDefined();

      // Should have pattern parameter
      const patternParam = findTool?.parameters.find((param) => param.name === 'pattern');
      expect(patternParam).toBeDefined();
      expect(patternParam?.type).toBe('string');
      expect(patternParam?.required).toBe(true);

      // Should have options parameter as object
      const optionsParam = findTool?.parameters.find((param) => param.name === 'options');
      expect(optionsParam).toBeDefined();
      expect(optionsParam?.type).toBe('object');
      expect(optionsParam?.required).toBe(false); // Should be optional
      expect(optionsParam?.properties).toBeDefined();
      expect(Array.isArray(optionsParam?.properties)).toBe(true);

      // Check nested properties
      if (optionsParam?.properties) {
        const limitParam = optionsParam.properties.find((prop) => prop.name === 'limit');
        expect(limitParam).toBeDefined();
        expect(limitParam?.type).toBe('number');
      }
    });
  });

  describe('getToolMetadata', () => {
    it('should return metadata for existing tool', () => {
      const metadata = getToolMetadata('screenshot');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('screenshot');
      expect(metadata?.description).toContain('screenshot');
    });

    it('should return undefined for non-existing tool', () => {
      const metadata = getToolMetadata('nonexistent');
      expect(metadata).toBeUndefined();
    });
  });

  describe('validateToolArguments', () => {
    it('should validate correct arguments', () => {
      const result = validateToolArguments('screenshot', { fullPage: true });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate arguments with default values', () => {
      const result = validateToolArguments('screenshot', {});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid arguments', () => {
      const result = validateToolArguments('screenshot', { fullPage: 'not-a-boolean' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject arguments for non-existing tool', () => {
      const result = validateToolArguments('nonexistent', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool nonexistent not found');
    });

    it('should validate required parameters', () => {
      const result = validateToolArguments('find', {}); // Missing required pattern
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept valid nested objects', () => {
      const result = validateToolArguments('find', {
        pattern: 'button',
        options: {
          limit: 5,
          includeHidden: false,
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
