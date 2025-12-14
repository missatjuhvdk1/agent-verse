/**
 * Custom error classes for MCP server.
 */
export declare class ValidationError extends Error {
    details?: unknown | undefined;
    constructor(message: string, details?: unknown | undefined);
}
export declare class FetchError extends Error {
    url?: string | undefined;
    cause?: Error | undefined;
    constructor(message: string, url?: string | undefined, cause?: Error | undefined);
}
//# sourceMappingURL=errors.d.ts.map