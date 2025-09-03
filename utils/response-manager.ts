import browser from 'webextension-polyfill';
import { DEFAULT_TRUNCATION_LIMIT } from '~/utils/constants';
import { createLogger } from '~/utils/debug-logger';
import { settingsManager } from '~/utils/settings-manager';

/**
 * Response Manager
 *
 * Provides global truncation and pagination for tool responses to prevent context overflow
 * and allow users to paginate through large responses.
 */

export interface TruncationResult {
  content: string | any;
  isTruncated: boolean;
  originalLength: number;
  truncatedLength: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
  pageSize: number;
  responseId: string;
}

export interface PaginationRequest {
  responseId: string;
  page: number;
}

interface BufferedResponse {
  originalContent: string;
  contentType: 'text' | 'json' | 'mixed';
  timestamp: number;
  toolName?: string;
  pageSize: number;
}

class ResponseManagerClass {
  private responseBuffer = new Map<string, BufferedResponse>();
  private currentTruncationLimit: number = DEFAULT_TRUNCATION_LIMIT;
  private maxBufferSize: number = 50; // Keep last 50 responses
  private logger = createLogger('background');

  constructor() {
    this.initializeSettings();
    this.setupStorageListener();
  }

  private async initializeSettings() {
    try {
      const settings = await settingsManager.getSettings();
      if (settings.truncationLimit) {
        this.currentTruncationLimit = settings.truncationLimit;
      }
    } catch (error) {
      this.logger.warn('Failed to load truncation settings, using default', {
        defaultLimit: DEFAULT_TRUNCATION_LIMIT,
        error,
      });
    }
  }

  private setupStorageListener() {
    // Listen for settings changes to update truncation limit
    if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
      browser.storage.onChanged.addListener((changes: any, areaName: string) => {
        if (areaName === 'local' && changes.settings?.newValue?.truncationLimit) {
          this.currentTruncationLimit = changes.settings.newValue.truncationLimit;
        }
      });
    }
  }

  /**
   * Truncate and buffer a tool response with pagination support
   */
  truncateResponse(
    content: string | any,
    toolName?: string,
    customPageSize?: number,
  ): TruncationResult {
    const responseId = this.generateResponseId();
    const pageSize = customPageSize || this.currentTruncationLimit;

    // Handle different content types
    let stringContent: string;
    let contentType: 'text' | 'json' | 'mixed' = 'text';
    const originalContent = content;

    if (typeof content === 'string') {
      stringContent = content;
    } else {
      try {
        // Use dense JSON (no whitespace) to save tokens
        stringContent = JSON.stringify(content);
        contentType = 'json';
      } catch {
        stringContent = String(content);
      }
    }

    // Check if content fits within page size
    if (stringContent.length <= pageSize) {
      // Content fits in one page - return original object if it's JSON, string otherwise
      return {
        content: contentType === 'json' ? originalContent : stringContent,
        isTruncated: false,
        originalLength: stringContent.length,
        truncatedLength: stringContent.length,
        currentPage: 1,
        totalPages: 1,
        hasMore: false,
        hasPrevious: false,
        pageSize,
        responseId,
      };
    }

    // Content needs truncation - buffer as string and paginate
    this.bufferResponse(responseId, stringContent, contentType, toolName, pageSize);

    // Return first page (will be truncated string)
    return this.getPage(responseId, 1);
  }

  /**
   * Get a specific page of a buffered response
   */
  getPage(responseId: string, page: number): TruncationResult {
    const buffered = this.responseBuffer.get(responseId);

    if (!buffered) {
      throw new Error(`Response not found: ${responseId}`);
    }

    const { originalContent, contentType, pageSize } = buffered;
    const totalPages = Math.ceil(originalContent.length / pageSize);
    const validPage = Math.max(1, Math.min(page, totalPages));

    const startIndex = (validPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, originalContent.length);

    let pageContent = originalContent.substring(startIndex, endIndex);

    // Smart truncation for different content types
    if (contentType === 'json' && validPage < totalPages) {
      pageContent = this.smartJsonTruncation(pageContent, originalContent, startIndex, endIndex);
    } else if (contentType === 'text' && validPage < totalPages) {
      pageContent = this.smartTextTruncation(pageContent, originalContent, startIndex, endIndex);
    }

    const isTruncated = originalContent.length > pageSize;

    // Add pagination information to content if truncated
    let finalContent = pageContent;
    if (isTruncated && validPage < totalPages && !pageContent.includes('[TRUNCATED')) {
      finalContent =
        pageContent +
        '\n\n[TRUNCATED - Use getResponsePage tool with responseId to see more content]';
    }

    return {
      content: finalContent,
      isTruncated,
      originalLength: originalContent.length,
      truncatedLength: finalContent.length,
      currentPage: validPage,
      totalPages,
      hasMore: validPage < totalPages,
      hasPrevious: validPage > 1,
      pageSize,
      responseId,
    };
  }

  /**
   * Smart JSON truncation - try to preserve structure
   */
  private smartJsonTruncation(
    pageContent: string,
    _originalContent: string,
    _startIndex: number,
    _endIndex: number,
  ): string {
    // If we're in the middle of JSON, try to end at a complete object/array
    try {
      // Check if we can parse the current page content
      JSON.parse(pageContent);
      return pageContent; // Already valid JSON
    } catch {
      // Try to find the last complete JSON structure
      const lines = pageContent.split('\n');
      let validJson = '';

      for (let i = lines.length - 1; i >= 0; i--) {
        const candidate = lines.slice(0, i + 1).join('\n');
        try {
          JSON.parse(candidate);
          validJson = candidate;
          break;
        } catch {}
      }

      if (validJson) {
        return (
          validJson +
          '\n\n[TRUNCATED - Use getResponsePage tool with responseId to see more content]'
        );
      }

      // Fallback to basic truncation with JSON indicator
      return `${pageContent}\n\n[JSON TRUNCATED - Use getResponsePage tool with responseId to continue]`;
    }
  }

  /**
   * Smart text truncation - try to end at sentence boundaries
   */
  private smartTextTruncation(
    pageContent: string,
    _originalContent: string,
    _startIndex: number,
    _endIndex: number,
  ): string {
    // Try to end at a sentence boundary
    const sentenceEndings = ['. ', '.\n', '! ', '!\n', '? ', '?\n'];
    let bestCut = pageContent.length;

    // Look backwards from the end for a sentence ending
    for (let i = pageContent.length - 20; i >= pageContent.length - 100 && i >= 0; i--) {
      for (const ending of sentenceEndings) {
        if (pageContent.substring(i).startsWith(ending)) {
          bestCut = i + ending.length;
          break;
        }
      }
      if (bestCut < pageContent.length) break;
    }

    if (bestCut < pageContent.length) {
      return (
        pageContent.substring(0, bestCut) +
        '\n\n[TRUNCATED - Use getResponsePage tool with responseId to see more content]'
      );
    }

    return `${pageContent}\n\n[TRUNCATED - Use getResponsePage tool with responseId to see more content]`;
  }

  /**
   * Buffer a response for pagination
   */
  private bufferResponse(
    responseId: string,
    content: string,
    contentType: 'text' | 'json' | 'mixed',
    toolName?: string,
    pageSize?: number,
  ): void {
    this.responseBuffer.set(responseId, {
      originalContent: content,
      contentType,
      timestamp: Date.now(),
      toolName,
      pageSize: pageSize || this.currentTruncationLimit,
    });

    // Clean up old responses if buffer gets too large
    this.cleanupBuffer();
  }

  /**
   * Clean up old responses to prevent memory leaks
   */
  private cleanupBuffer(): void {
    if (this.responseBuffer.size <= this.maxBufferSize) {
      return;
    }

    // Convert to array and sort by timestamp
    const entries = Array.from(this.responseBuffer.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    // Remove oldest entries
    const toRemove = entries.slice(0, this.responseBuffer.size - this.maxBufferSize);
    for (const [id] of toRemove) {
      this.responseBuffer.delete(id);
    }
  }

  /**
   * Generate a unique response ID using timestamp and counter
   */
  private static idCounter = 0;

  private generateResponseId(): string {
    ResponseManagerClass.idCounter = (ResponseManagerClass.idCounter + 1) % 10000;
    return `resp_${Date.now()}_${ResponseManagerClass.idCounter.toString().padStart(4, '0')}`;
  }

  /**
   * Check if a response is available for pagination
   */
  hasResponse(responseId: string): boolean {
    return this.responseBuffer.has(responseId);
  }

  /**
   * Get response metadata without content
   */
  getResponseInfo(responseId: string): Omit<TruncationResult, 'content'> | null {
    const buffered = this.responseBuffer.get(responseId);
    if (!buffered) return null;

    const totalPages = Math.ceil(buffered.originalContent.length / buffered.pageSize);
    const isTruncated = buffered.originalContent.length > buffered.pageSize;

    return {
      isTruncated,
      originalLength: buffered.originalContent.length,
      truncatedLength: Math.min(buffered.pageSize, buffered.originalContent.length),
      currentPage: 1,
      totalPages,
      hasMore: totalPages > 1,
      hasPrevious: false,
      pageSize: buffered.pageSize,
      responseId,
    };
  }

  /**
   * Clear all buffered responses
   */
  clearBuffer(): void {
    this.responseBuffer.clear();
  }

  /**
   * Get current truncation limit
   */
  getTruncationLimit(): number {
    return this.currentTruncationLimit;
  }

  /**
   * Set truncation limit (for testing or manual override)
   */
  setTruncationLimit(limit: number): void {
    this.currentTruncationLimit = Math.max(100, limit); // Minimum 100 chars
  }
}

// Export singleton instance
export const responseManager = new ResponseManagerClass();
