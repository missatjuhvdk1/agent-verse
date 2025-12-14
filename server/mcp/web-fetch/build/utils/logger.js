/**
 * Structured logging utility for MCP server.
 * CRITICAL: All logs go to stderr to avoid corrupting JSON-RPC stdio protocol.
 */
/**
 * Structured logger that outputs JSON to stderr.
 * Safe for MCP stdio transport - never writes to stdout.
 */
export class Logger {
    context;
    constructor(context) {
        this.context = context;
    }
    log(level, message, data) {
        const entry = {
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
    debug(message, data) {
        this.log('debug', message, data);
    }
    info(message, data) {
        this.log('info', message, data);
    }
    warn(message, data) {
        this.log('warn', message, data);
    }
    error(message, error) {
        const errorData = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error;
        this.log('error', message, errorData);
    }
    /**
     * Create a child logger with additional context.
     */
    child(context) {
        return new Logger(this.context ? `${this.context}:${context}` : context);
    }
}
/**
 * Default logger instance.
 */
export const logger = new Logger('web-fetch-mcp');
//# sourceMappingURL=logger.js.map