/**
 * Zod schemas for web fetch tool input validation.
 */
import { z } from 'zod';
/**
 * Schema for fetch_page tool.
 */
export declare const FetchPageSchema: z.ZodObject<{
    url: z.ZodString;
    contentSelector: z.ZodOptional<z.ZodString>;
    waitFor: z.ZodOptional<z.ZodString>;
    waitTime: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    contentSelector?: string | undefined;
    waitFor?: string | undefined;
    waitTime?: number | undefined;
}, {
    url: string;
    contentSelector?: string | undefined;
    waitFor?: string | undefined;
    waitTime?: number | undefined;
}>;
export type FetchPageInput = z.infer<typeof FetchPageSchema>;
/**
 * Convert Zod schema to JSON Schema for MCP tool registration.
 */
export declare function zodToJsonSchema(schema: z.ZodType): Record<string, unknown>;
//# sourceMappingURL=tool-schemas.d.ts.map