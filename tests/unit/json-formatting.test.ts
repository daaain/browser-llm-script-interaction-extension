import { describe, expect, it } from 'vitest';

describe('Dense JSON Formatting', () => {
  it('should produce compact JSON without whitespace', () => {
    const testObject = {
      key: 'value',
      nested: {
        array: [1, 2, 3],
        bool: true,
        null: null,
      },
    };

    const denseJson = JSON.stringify(testObject);
    const formattedJson = JSON.stringify(testObject, null, 2);

    // Dense JSON should be significantly shorter
    expect(denseJson.length).toBeLessThan(formattedJson.length * 0.7);

    // Dense JSON should not contain extra whitespace
    expect(denseJson).not.toMatch(/:\s/);
    expect(denseJson).not.toMatch(/,\s/);
    expect(denseJson).not.toMatch(/\n/);
    expect(denseJson).not.toMatch(/\s{2,}/);

    // But should still be valid JSON
    expect(() => JSON.parse(denseJson)).not.toThrow();
    expect(JSON.parse(denseJson)).toEqual(testObject);
  });

  it('should handle complex object structures densely', () => {
    const complexObject = {
      success: true,
      result: {
        elements: [
          {
            selector: '#search-input',
            text: 'Search here',
            tag: 'input',
            classes: 'search-box form-control',
          },
          {
            selector: 'button[type="submit"]',
            text: 'Search',
            tag: 'button',
            classes: 'btn btn-primary',
          },
        ],
        total: 2,
        hasMore: false,
      },
    };

    const denseJson = JSON.stringify(complexObject);

    // Verify it's compact
    expect(denseJson).not.toMatch(/:\s/g); // No colon-space patterns
    expect(denseJson).not.toMatch(/,\s/g); // No comma-space patterns
    expect(denseJson).not.toMatch(/\s{2,}/g); // No multiple spaces
    expect(denseJson).not.toContain('\n'); // No newlines

    // Verify it preserves structure
    const parsed = JSON.parse(denseJson);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.result.elements)).toBe(true);
    expect(parsed.result.elements).toHaveLength(2);
    expect(parsed.result.elements[0].selector).toBe('#search-input');
  });

  it('should demonstrate dual formatting approach benefits', () => {
    const toolResult = {
      success: true,
      result: {
        elements: Array.from({ length: 5 }, (_, i) => ({
          selector: `#element-${i}`,
          text: `Element ${i} text content`,
          tag: 'div',
          classes: `class-${i} common-class`,
        })),
        total: 5,
        hasMore: false,
      },
    };

    // Dense format for API (saves tokens)
    const denseForApi = JSON.stringify(toolResult);

    // Pretty format for UI (better readability)
    const prettyForUi = JSON.stringify(toolResult, null, 2);

    console.log(`Dense JSON for API: ${denseForApi.length} characters`);
    console.log(`Pretty JSON for UI: ${prettyForUi.length} characters`);
    console.log(
      `Token savings: ${Math.round((1 - denseForApi.length / prettyForUi.length) * 100)}%`,
    );

    // Verify both formats are valid JSON
    expect(() => JSON.parse(denseForApi)).not.toThrow();
    expect(() => JSON.parse(prettyForUi)).not.toThrow();

    // Verify they produce the same object
    expect(JSON.parse(denseForApi)).toEqual(JSON.parse(prettyForUi));

    // Dense should save significant space for API
    expect(denseForApi.length).toBeLessThan(prettyForUi.length * 0.75);

    // Pretty format should be more readable (has newlines and indentation)
    expect(prettyForUi).toContain('\n');
    expect(prettyForUi).toMatch(/^\s+/m); // Has indented lines
    expect(denseForApi).not.toContain('\n');
  });
});
