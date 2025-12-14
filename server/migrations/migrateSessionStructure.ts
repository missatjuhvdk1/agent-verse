/**
 * Session Structure Migration - Phase 0.1
 * Migrates existing sessions to new directory structure with metadata/ and workspace/ separation
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSessionPaths } from '../directoryUtils';

/**
 * Check if session needs migration
 * Returns true if workspace/ directory doesn't exist (indicating old structure)
 */
export function needsMigration(sessionId: string): boolean {
  const paths = getSessionPaths(sessionId);

  // If workspace exists, already migrated
  if (fs.existsSync(paths.workspace)) {
    return false;
  }

  // If root doesn't exist, nothing to migrate
  if (!fs.existsSync(paths.root)) {
    return false;
  }

  return true;
}

/**
 * Migrate a session to new directory structure
 * Non-destructive: moves files instead of deleting
 * Synchronous to allow calling from database.getSession()
 */
export function migrateSessionIfNeeded(sessionId: string): void {
  const paths = getSessionPaths(sessionId);

  // Check if already migrated
  if (fs.existsSync(paths.workspace)) {
    // Silently skip if already migrated (not an error)
    return;
  }

  // Check if session root exists
  if (!fs.existsSync(paths.root)) {
    console.log(`⚠️  Session ${sessionId} root doesn't exist, skipping migration`);
    return;
  }

  console.log(`🔄 Migrating session ${sessionId} to new structure...`);

  try {
    // 1. Create new directories
    if (!fs.existsSync(paths.metadata)) {
      fs.mkdirSync(paths.metadata, { recursive: true });
      console.log(`  ✓ Created metadata/ directory`);
    }

    if (!fs.existsSync(paths.workspace)) {
      fs.mkdirSync(paths.workspace, { recursive: true });
      console.log(`  ✓ Created workspace/ directory`);
    }

    // 2. Move CLAUDE.md to metadata/ (if exists)
    const oldClaudeMd = path.join(paths.root, 'CLAUDE.md');
    if (fs.existsSync(oldClaudeMd)) {
      fs.renameSync(oldClaudeMd, paths.claudeMd);
      console.log(`  ✓ Moved CLAUDE.md to metadata/`);
    }

    // 3. Move all other files/folders to workspace/
    const entries = fs.readdirSync(paths.root, { withFileTypes: true });
    let movedCount = 0;

    for (const entry of entries) {
      const name = entry.name;

      // Skip: .claude, metadata, workspace (these stay in root)
      if (name === '.claude' || name === 'metadata' || name === 'workspace') {
        continue;
      }

      // Move everything else to workspace/
      const oldPath = path.join(paths.root, name);
      const newPath = path.join(paths.workspace, name);

      try {
        fs.renameSync(oldPath, newPath);
        movedCount++;
        console.log(`  ✓ Moved ${name} to workspace/`);
      } catch (error) {
        console.warn(`  ⚠️  Failed to move ${name}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`✅ Session ${sessionId} migrated successfully (${movedCount} items moved to workspace/)`);

  } catch (error) {
    console.error(`❌ Failed to migrate session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Migrate all sessions in bulk
 * Useful for one-time migration of existing installations
 */
export async function migrateAllSessions(): Promise<{ success: number; failed: number; skipped: number }> {
  const { sessionDb } = await import('../database');
  const { sessions } = sessionDb.getSessions();

  let success = 0;
  let failed = 0;
  let skipped = 0;

  console.log(`🔄 Starting bulk migration for ${sessions.length} sessions...`);

  for (const session of sessions) {
    try {
      const needed = needsMigration(session.id);

      if (!needed) {
        skipped++;
        continue;
      }

      migrateSessionIfNeeded(session.id);
      success++;
    } catch (error) {
      console.error(`❌ Failed to migrate session ${session.id}:`, error);
      failed++;
    }
  }

  console.log(`✅ Bulk migration complete: ${success} success, ${failed} failed, ${skipped} skipped`);

  return { success, failed, skipped };
}
