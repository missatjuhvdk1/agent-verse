/**
 * Command Setup - Automatically copies slash commands to session directories
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBinaryDir } from './startup';
import { getSessionPaths } from './directoryUtils';

/**
 * Setup slash commands for a session by copying template .md files
 * Creates .claude/commands/ directory in session's working directory
 * and populates it with shared + mode-specific commands
 * Also copies mode-specific CLAUDE.md to working directory root
 */
export function setupSessionCommands(workingDir: string, mode: string): void {
  const commandsDir = path.join(workingDir, '.claude', 'commands');

  // Create .claude/commands/ directory
  if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
  }

  // Get the app's base directory (works in both dev and release)
  const baseDir = getBinaryDir();

  let copiedCount = 0;

  // Copy shared commands (available in all modes)
  const sharedCommandsDir = path.join(baseDir, 'server', 'commands', 'shared');
  if (fs.existsSync(sharedCommandsDir)) {
    const sharedFiles = fs.readdirSync(sharedCommandsDir).filter(f => f.endsWith('.md'));
    for (const file of sharedFiles) {
      const sourcePath = path.join(sharedCommandsDir, file);
      const destPath = path.join(commandsDir, file);
      fs.copyFileSync(sourcePath, destPath);
      copiedCount++;
    }
  }

  // Copy mode-specific commands
  const modeCommandsDir = path.join(baseDir, 'server', 'commands', mode);
  if (fs.existsSync(modeCommandsDir)) {
    const modeFiles = fs.readdirSync(modeCommandsDir).filter(f => f.endsWith('.md'));
    for (const file of modeFiles) {
      const sourcePath = path.join(modeCommandsDir, file);
      const destPath = path.join(commandsDir, file);
      fs.copyFileSync(sourcePath, destPath);
      copiedCount++;
    }
  }

  // Phase 0.1: Write CLAUDE.md to metadata/ directory instead of root
  // Extract session ID from working directory path (e.g., chat-446f7a5e)
  const sessionId = path.basename(workingDir).replace('chat-', '');
  const paths = getSessionPaths(sessionId);

  const templateClaudeFile = path.join(baseDir, 'server', 'templates', mode, 'CLAUDE.md');
  const destClaudeFile = paths.claudeMd;

  // Ensure metadata directory exists
  if (!fs.existsSync(paths.metadata)) {
    fs.mkdirSync(paths.metadata, { recursive: true });
  }

  // Only copy if template exists and destination doesn't exist (don't overwrite user's CLAUDE.md)
  if (fs.existsSync(templateClaudeFile) && !fs.existsSync(destClaudeFile)) {
    fs.copyFileSync(templateClaudeFile, destClaudeFile);
    console.log(`📝 Created CLAUDE.md in metadata/ for ${mode} mode`);
  }

  // Only log if commands were actually copied (less noise)
  if (copiedCount > 0) {
    console.log(`📋 Loaded ${copiedCount} slash command${copiedCount === 1 ? '' : 's'} for ${mode} mode`);
  }
}

/**
 * Get count of available commands for a session
 */
export function getCommandCount(workingDir: string): number {
  const commandsDir = path.join(workingDir, '.claude', 'commands');

  if (!fs.existsSync(commandsDir)) {
    return 0;
  }

  const files = fs.readdirSync(commandsDir);
  return files.filter(f => f.endsWith('.md')).length;
}
