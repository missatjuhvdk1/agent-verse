/**
 * Structured logging utility for MCP server.
 * CRITICAL: All logs go to stderr to avoid corrupting JSON-RPC stdio protocol.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Structured logger that outputs JSON to stderr.
 * Safe for MCP stdio transport - never writes to stdout.
 */
export declare class Logger {
    private context?;
    constructor(context?: string | undefined);
    private log;
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, error?: Error | unknown): void;
    /**
     * Create a child logger with additional context.
     */
    child(context: string): Logger;
}
/**
 * Default logger instance.
 */
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map