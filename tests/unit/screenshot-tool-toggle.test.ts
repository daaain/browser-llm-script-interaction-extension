import { describe, expect, it } from 'vitest';
import { getToolsForSettings } from '~/utils/ai-tools';

describe('Screenshot Tool Toggle', () => {
  it('should include screenshot tool when enabled', () => {
    const settings = { toolsEnabled: true, screenshotToolEnabled: true };
    const tools = getToolsForSettings(settings);

    expect('screenshot' in tools).toBe(true);
    expect('find' in tools).toBe(true);
    expect('click' in tools).toBe(true);
  });

  it('should exclude screenshot tool when disabled', () => {
    const settings = { toolsEnabled: true, screenshotToolEnabled: false };
    const tools = getToolsForSettings(settings);

    expect('screenshot' in tools).toBe(false);
    expect('find' in tools).toBe(true);
    expect('click' in tools).toBe(true);
  });

  it('should return empty tools when toolsEnabled is false', () => {
    const settings = { toolsEnabled: false, screenshotToolEnabled: true };
    const tools = getToolsForSettings(settings);

    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('should always include pagination tool when tools are enabled', () => {
    const settings1 = { toolsEnabled: true, screenshotToolEnabled: true };
    const settings2 = { toolsEnabled: true, screenshotToolEnabled: false };

    const tools1 = getToolsForSettings(settings1);
    const tools2 = getToolsForSettings(settings2);

    expect('getResponsePage' in tools1).toBe(true);
    expect('getResponsePage' in tools2).toBe(true);
  });
});
