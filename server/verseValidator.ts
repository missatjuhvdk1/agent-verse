/**
 * agent-verse - Verse Code Validator
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * High-level Verse validation interface for agents.
 * Combines LSP validation with custom Verse syntax rules.
 */

import { VerseLSPClient, getVerseLSPPath, type ValidationResult, DiagnosticSeverity } from './verseLSPClient';

/**
 * Common Verse syntax mistakes (catches errors before LSP)
 */
export interface VerseSyntaxRule {
  name: string;
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Pre-flight syntax rules (fast checks before LSP)
 */
const VERSE_SYNTAX_RULES: VerseSyntaxRule[] = [
  {
    name: 'missing-suspends',
    pattern: /\b(Sleep|Await|OnBegin)\s*\([^)]*\)[^:]*:\s*\w+\s*=/,
    message: 'Async function missing <suspends> specifier (e.g., OnBegin<override>()<suspends>:void=)',
    severity: 'error',
  },
  {
    name: 'failable-without-brackets',
    pattern: /(\w+)\s*:=\s*(\w+)\(\)/,
    message: 'Failable expression needs [] brackets and failure context (e.g., if (Player := GetPlayer[]):)',
    severity: 'warning',
  },
  {
    name: 'editable-no-initializer',
    pattern: /@editable\s+\w+\s*:\s*\w+\s*$/m,
    message: '@editable field missing default initializer (e.g., @editable MyButton : button_device = button_device{})',
    severity: 'error',
  },
  {
    name: 'semicolon-separator',
    pattern: /;\s*$/m,
    message: 'Verse uses newlines, not semicolons (V1 deprecates semicolons)',
    severity: 'warning',
  },
];

/**
 * Verse Validator
 *
 * Provides multi-layered validation:
 * 1. Fast syntax rule checks (instant)
 * 2. LSP validation (full compiler errors) - optional
 */
export class VerseValidator {
  private lspClient: VerseLSPClient | null = null;
  private lspAvailable = false;

  constructor() {
    this.initializeLSP();
  }

  /**
   * Initialize LSP client (async, non-blocking)
   */
  private async initializeLSP(): Promise<void> {
    try {
      const lspPath = getVerseLSPPath();
      if (!lspPath) {
        console.warn('[Verse Validator] LSP not found, using syntax rules only');
        return;
      }

      this.lspClient = new VerseLSPClient(lspPath);
      await this.lspClient.start();
      await this.lspClient.initialize();
      this.lspAvailable = true;
      console.log('[Verse Validator] LSP initialized successfully');
    } catch (error) {
      console.error('[Verse Validator] LSP initialization failed:', error);
      this.lspAvailable = false;
    }
  }

  /**
   * Quick syntax validation (no LSP, instant)
   */
  validateSyntax(code: string): { issues: string[]; hasErrors: boolean } {
    const issues: string[] = [];
    let hasErrors = false;

    for (const rule of VERSE_SYNTAX_RULES) {
      if (rule.pattern.test(code)) {
        issues.push(`[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.message}`);
        if (rule.severity === 'error') {
          hasErrors = true;
        }
      }
    }

    return { issues, hasErrors };
  }

  /**
   * Full validation (syntax + LSP)
   */
  async validate(code: string): Promise<{
    success: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Fast syntax checks
    const syntaxResult = this.validateSyntax(code);
    for (const issue of syntaxResult.issues) {
      if (issue.includes('[ERROR]')) {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }

    // 2. LSP validation (if available)
    if (this.lspAvailable && this.lspClient) {
      try {
        const lspResult: ValidationResult = await this.lspClient.validateCode(code);

        for (const diagnostic of lspResult.diagnostics) {
          const message = `Line ${diagnostic.line}: ${diagnostic.message}`;
          if (diagnostic.severity === DiagnosticSeverity.Error) {
            errors.push(message);
          } else if (diagnostic.severity === DiagnosticSeverity.Warning) {
            warnings.push(message);
          }
        }
      } catch (error) {
        console.error('[Verse Validator] LSP validation failed:', error);
        warnings.push('LSP validation unavailable');
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Format validation result for agent consumption
   */
  formatValidationResult(result: {
    success: boolean;
    errors: string[];
    warnings: string[];
  }): string {
    if (result.success && result.warnings.length === 0) {
      return '✅ Code validation passed!';
    }

    let output = '';

    if (result.errors.length > 0) {
      output += '❌ ERRORS:\n';
      for (const error of result.errors) {
        output += `  • ${error}\n`;
      }
    }

    if (result.warnings.length > 0) {
      output += '⚠️ WARNINGS:\n';
      for (const warning of result.warnings) {
        output += `  • ${warning}\n`;
      }
    }

    if (result.success && result.warnings.length > 0) {
      output += '\n✅ No errors, but consider fixing warnings.\n';
    }

    return output;
  }

  /**
   * Cleanup (stop LSP)
   */
  async cleanup(): Promise<void> {
    if (this.lspClient) {
      await this.lspClient.stop();
      this.lspClient = null;
      this.lspAvailable = false;
    }
  }
}

// Singleton instance
let validatorInstance: VerseValidator | null = null;

/**
 * Get the global Verse validator instance
 */
export function getVerseValidator(): VerseValidator {
  if (!validatorInstance) {
    validatorInstance = new VerseValidator();
  }
  return validatorInstance;
}

/**
 * Cleanup validator on process exit
 */
process.on('exit', () => {
  if (validatorInstance) {
    validatorInstance.cleanup();
  }
});
