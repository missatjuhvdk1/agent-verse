/**
 * Structured logging utility for MCP server.
 * CRITICAL: All logs go to stderr to avoid corrupting JSON-RPC stdio protocol.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

/**
 * Structured logger that outputs JSON to stderr.
 * Safe for MCP stdio transport - never writes to stdout.
 */
export class Logger {
  constructor(private context?: string) {}

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (this.context) {
      entry.context = this.context;
    }

    if (data !== undefined) {
      entry.data = data;
    }

    // Always write to stderr, never stdout (critical for stdio transport)
    console.error(JSON.stringify(entry));
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | unknown): void {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    this.log('error', message, errorData);
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: string): Logger {
    return new Logger(this.context ? `${this.context}:${context}` : context);
  }
}

/**
 * Default logger instance.
 */
export const logger = new Logger('web-fetch-mcp');
