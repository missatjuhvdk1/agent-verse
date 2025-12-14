/**
 * Custom error classes for MCP server.
 */
export class ValidationError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = 'ValidationError';
    }
}
export class FetchError extends Error {
    url;
    cause;
    constructor(message, url, cause) {
        super(message);
        this.url = url;
        this.cause = cause;
        this.name = 'FetchError';
    }
}
//# sourceMappingURL=errors.js.map