/**
 * Custom error classes for MCP server.
 */

export class ValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FetchError extends Error {
  constructor(message: string, public url?: string, public cause?: Error) {
    super(message);
    this.name = 'FetchError';
  }
}
