/**
 * Zod schemas for web fetch tool input validation.
 */

import { z } from 'zod';

/**
 * Schema for fetch_page tool.
 */
export const FetchPageSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .describe('The URL to fetch'),
  contentSelector: z
    .string()
    .optional()
    .describe('Optional CSS selector to extract main content (e.g., "main", "article", ".content")'),
  waitFor: z
    .string()
    .optional()
    .describe('Optional CSS selector to wait for before returning'),
  waitTime: z
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(15000)
    .optional()
    .describe('Maximum time to wait in milliseconds (default: 15000)'),
});

export type FetchPageInput = z.infer<typeof FetchPageSchema>;

/**
 * Convert Zod schema to JSON Schema for MCP tool registration.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema === FetchPageSchema) {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
          format: 'uri',
        },
        contentSelector: {
          type: 'string',
          description: 'Optional CSS selector to extract main content (e.g., "main", "article", ".content")',
        },
        waitFor: {
          type: 'string',
          description: 'Optional CSS selector to wait for before returning',
        },
        waitTime: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 15000)',
          minimum: 1000,
          maximum: 60000,
          default: 15000,
        },
      },
      required: ['url'],
    };
  }

  return { type: 'object' };
}
