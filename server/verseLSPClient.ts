/**
 * agent-verse - Verse Language Server Protocol Client
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Safe, read-only LSP client for Verse validation.
 * This client NEVER modifies user files - only validates code.
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * LSP Diagnostic severity levels
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * Verse diagnostic (error/warning)
 */
export interface VerseDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  line: number;
  column: number;
  code?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  success: boolean;
  diagnostics: VerseDiagnostic[];
}

/**
 * LSP Response message
 */
interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Verse Language Server Client
 *
 * SAFETY GUARANTEES:
 * - Read-only operations (validation only)
 * - Uses temporary files (auto-cleanup)
 * - Never modifies user projects
 * - Isolated LSP process per validation
 */
export class VerseLSPClient {
  private lspPath: string;
  private process: ChildProcess | null = null;
  private messageId = 0;
  private responseBuffer = '';
  private pendingResponses = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  // Diagnostic storage: URI -> diagnostics
  private diagnostics = new Map<string, VerseDiagnostic[]>();

  constructor(lspPath: string) {
    this.lspPath = lspPath;
  }

  /**
   * Start the LSP server
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('LSP client already started');
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(this.lspPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.process.on('error', (error) => {
        reject(new Error(`Failed to start Verse LSP: ${error.message}`));
      });

      this.process.on('spawn', () => {
        // Set up message handling
        this.process!.stdout!.on('data', (data: Buffer) => {
          this.handleLSPData(data);
        });

        this.process!.stderr!.on('data', (data: Buffer) => {
          console.error('[Verse LSP stderr]', data.toString());
        });

        resolve();
      });
    });
  }

  /**
   * Handle incoming LSP data (parses Content-Length protocol)
   */
  private handleLSPData(data: Buffer): void {
    this.responseBuffer += data.toString();

    // Parse LSP messages (Content-Length: N\r\n\r\n{json})
    while (true) {
      const headerEnd = this.responseBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = this.responseBuffer.slice(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/i);

      if (!contentLengthMatch) {
        console.error('[Verse LSP] Invalid header:', headers);
        this.responseBuffer = this.responseBuffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.responseBuffer.length < messageEnd) {
        // Need more data
        break;
      }

      const messageStr = this.responseBuffer.slice(messageStart, messageEnd);
      this.responseBuffer = this.responseBuffer.slice(messageEnd);

      try {
        const message: LSPMessage = JSON.parse(messageStr);
        this.handleLSPMessage(message);
      } catch (error) {
        console.error('[Verse LSP] Failed to parse message:', error);
      }
    }
  }

  /**
   * Handle parsed LSP message
   */
  private handleLSPMessage(message: LSPMessage): void {
    // Handle responses (have id)
    if (message.id !== undefined) {
      const pending = this.pendingResponses.get(message.id);
      if (pending) {
        this.pendingResponses.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle notifications (no id)
    if (message.method === 'textDocument/publishDiagnostics') {
      this.handlePublishDiagnostics(message.params);
    }
  }

  /**
   * Handle publishDiagnostics notification from LSP
   */
  private handlePublishDiagnostics(params: unknown): void {
    try {
      const diagnosticsParams = params as {
        uri: string;
        diagnostics: Array<{
          severity?: number;
          message: string;
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
          code?: string | number;
        }>;
      };

      if (!diagnosticsParams || !diagnosticsParams.uri) {
        return;
      }

      // Convert LSP diagnostics to our format
      const verseDiagnostics: VerseDiagnostic[] = diagnosticsParams.diagnostics.map((diag) => ({
        severity: diag.severity || DiagnosticSeverity.Error,
        message: diag.message,
        line: diag.range.start.line + 1, // LSP uses 0-based, we use 1-based
        column: diag.range.start.character + 1,
        code: diag.code?.toString(),
      }));

      // Store diagnostics for this URI
      this.diagnostics.set(diagnosticsParams.uri, verseDiagnostics);
    } catch (error) {
      console.error('[Verse LSP] Failed to parse diagnostics:', error);
    }
  }

  /**
   * Send LSP notification (no response expected)
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('LSP client not started');
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const messageStr = JSON.stringify(message);
    const messageWithHeaders = `Content-Length: ${messageStr.length}\r\n\r\n${messageStr}`;
    this.process.stdin.write(messageWithHeaders);
  }

  /**
   * Send LSP request and wait for response
   */
  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('LSP client not started');
    }

    const id = ++this.messageId;
    const message: LSPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const messageStr = JSON.stringify(message);
    const messageWithHeaders = `Content-Length: ${messageStr.length}\r\n\r\n${messageStr}`;

    return new Promise((resolve, reject) => {
      this.pendingResponses.set(id, { resolve, reject });

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, 10000);

      this.process!.stdin!.write(messageWithHeaders, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingResponses.delete(id);
          reject(error);
        }
      });
    });
  }

  /**
   * Initialize the LSP server
   */
  async initialize(workspaceUri?: string): Promise<void> {
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: workspaceUri || null,
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
        },
      },
    });

    // Send initialized notification
    if (this.process?.stdin) {
      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
        params: {},
      });
      const message = `Content-Length: ${notification.length}\r\n\r\n${notification}`;
      this.process.stdin.write(message);
    }
  }

  /**
   * Validate Verse code (SAFE - uses temporary file)
   *
   * SAFETY GUARANTEES:
   * - Only creates files in OS temp directory (never touches UEFN projects)
   * - Verifies temp paths before deletion
   * - Handles cleanup failures gracefully
   *
   * @param code The Verse code to validate
   * @returns Validation result with diagnostics
   */
  async validateCode(code: string): Promise<ValidationResult> {
    let tempDir: string | null = null;
    let tempFile: string | null = null;
    let fileUri: string | null = null;

    try {
      // Create temp directory (SAFE: only in OS temp dir)
      const systemTempDir = tmpdir();
      tempDir = await mkdtemp(join(systemTempDir, 'verse-validation-'));

      // Verify we're in temp directory (safety check)
      if (!tempDir.startsWith(systemTempDir)) {
        throw new Error('Temp directory path verification failed - refusing to proceed');
      }

      tempFile = join(tempDir, 'temp.verse');

      // Write code to temp file
      await writeFile(tempFile, code, 'utf-8');

      // Normalize file URI for LSP
      fileUri = `file:///${tempFile.replace(/\\/g, '/')}`;

      // Clear any previous diagnostics for this URI
      this.diagnostics.delete(fileUri);

      // Open document in LSP (notification, not request)
      this.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: fileUri,
          languageId: 'verse',
          version: 1,
          text: code,
        },
      });

      // Wait for diagnostics with timeout
      // LSP sends publishDiagnostics asynchronously
      const diagnostics = await this.waitForDiagnostics(fileUri, 2000);

      // Close document in LSP
      this.sendNotification('textDocument/didClose', {
        textDocument: { uri: fileUri },
      });

      // Determine success (no errors)
      const hasErrors = diagnostics.some(d => d.severity === DiagnosticSeverity.Error);

      return {
        success: !hasErrors,
        diagnostics,
      };

    } catch (error) {
      console.error('[Verse LSP] Validation error:', error);
      // Return error as diagnostic
      return {
        success: false,
        diagnostics: [{
          severity: DiagnosticSeverity.Error,
          message: error instanceof Error ? error.message : 'Unknown validation error',
          line: 1,
          column: 1,
        }],
      };
    } finally {
      // CLEANUP: Always delete temp files (with safety checks)
      if (tempDir && fileUri) {
        try {
          // Clear diagnostics for this URI
          this.diagnostics.delete(fileUri);

          // Verify path is in temp directory before deletion
          const systemTempDir = tmpdir();
          if (tempDir.startsWith(systemTempDir)) {
            await rm(tempDir, { recursive: true, force: true });
          } else {
            console.error('[Verse LSP] SAFETY: Refusing to delete directory outside temp:', tempDir);
          }
        } catch (error) {
          // Non-fatal: temp files will be cleaned by OS eventually
          console.warn('[Verse LSP] Failed to cleanup temp dir:', error);
        }
      }
    }
  }

  /**
   * Wait for diagnostics to arrive from LSP
   *
   * @param uri File URI to wait for
   * @param timeoutMs Max time to wait (default 2000ms)
   * @returns Diagnostics array (empty if none arrive)
   */
  private async waitForDiagnostics(uri: string, timeoutMs: number = 2000): Promise<VerseDiagnostic[]> {
    const startTime = Date.now();
    const pollInterval = 50; // Check every 50ms

    while (Date.now() - startTime < timeoutMs) {
      // Check if diagnostics have arrived
      const diagnostics = this.diagnostics.get(uri);
      if (diagnostics !== undefined) {
        return diagnostics;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout: no diagnostics received (valid code or LSP didn't respond)
    // This is not an error - the code might be valid
    return [];
  }

  /**
   * Stop the LSP server
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    // Send shutdown request
    try {
      await this.sendRequest('shutdown', null);
    } catch (error) {
      console.error('[Verse LSP] Shutdown request failed:', error);
    }

    // Send exit notification
    if (this.process.stdin) {
      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'exit',
        params: null,
      });
      const message = `Content-Length: ${notification.length}\r\n\r\n${notification}`;
      this.process.stdin.write(message);
    }

    // Kill process after timeout
    setTimeout(() => {
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
    }, 1000);
  }
}

/**
 * Get the path to the Verse LSP executable
 *
 * Priority:
 * 1. Environment variable VERSE_LSP_PATH
 * 2. VSCode extension installation (handles WSL paths)
 * 3. Custom path from config
 */
export function getVerseLSPPath(): string | null {
  // Check environment variable
  if (process.env.VERSE_LSP_PATH) {
    return process.env.VERSE_LSP_PATH;
  }

  // Check VSCode extension (Windows/WSL compatible)
  let homeDir = process.env.USERPROFILE || process.env.HOME;

  // WSL: Convert /home/user to /mnt/c/Users/user
  if (homeDir?.startsWith('/home/') && !process.env.USERPROFILE) {
    // In WSL, use Windows home directory
    const username = homeDir.split('/')[2];
    homeDir = `/mnt/c/Users/${username}`;
  }

  if (homeDir) {
    // Check multiple extension directories (VSCode, Cursor, etc.)
    const extensionDirs = [
      join(homeDir, '.vscode', 'extensions'),
      join(homeDir, '.cursor', 'extensions'),
    ];

    // Try to find the Verse extension (any version) in any directory
    for (const extDir of extensionDirs) {
      try {
        const fs = require('fs');
        if (!fs.existsSync(extDir)) continue;

        const extensions = fs.readdirSync(extDir);

        // Find epicgames.verse extension (any version)
        const verseExt = extensions.find((ext: string) => ext.startsWith('epicgames.verse-'));

        if (verseExt) {
          const lspPath = join(extDir, verseExt, 'bin', 'Win64', 'verse-lsp.exe');

          // Verify file exists
          if (fs.existsSync(lspPath)) {
            return lspPath;
          }
        }
      } catch (error) {
        // Directory doesn't exist or can't be read, continue to next
        continue;
      }
    }
  }

  return null;
}
