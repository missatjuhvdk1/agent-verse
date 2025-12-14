/**
 * agent-verse - Verse Validation API Routes
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * API endpoints for validating Verse code using the Verse LSP.
 */

import { getVerseValidator } from '../verseValidator';

/**
 * Handle Verse validation routes
 */
export async function handleVerseRoutes(req: Request, url: URL): Promise<Response | undefined> {
  // POST /api/verse/validate - Validate Verse code
  if (req.method === 'POST' && url.pathname === '/api/verse/validate') {
    try {
      const body = await req.json() as { code?: string };
      const { code } = body;

      // Validate input
      if (!code || typeof code !== 'string') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing or invalid code parameter. Expected: { "code": "verse code here" }'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate the code
      const validator = getVerseValidator();
      const result = await validator.validate(code);

      // Return validation result
      return new Response(JSON.stringify({
        success: result.success,
        errors: result.errors,
        warnings: result.warnings,
        formatted: validator.formatValidationResult(result),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[Verse API] Validation error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // GET /api/verse/status - Check if Verse LSP is available
  if (req.method === 'GET' && url.pathname === '/api/verse/status') {
    try {
      const validator = getVerseValidator();
      // Check if LSP is available by testing with minimal code
      const testResult = await validator.validate('');

      return new Response(JSON.stringify({
        success: true,
        lspAvailable: true,
        message: 'Verse validator is ready'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        lspAvailable: false,
        message: 'Verse LSP not available, using syntax rules only',
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Route not handled
  return undefined;
}
