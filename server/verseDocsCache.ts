/**
 * Agent Smith - Verse Documentation Cache
 * Copyright (C) 2025 KenKai
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Caches Verse documentation locally using Playwright for fetching.
 * Bypasses 403 errors and provides instant access after first fetch.
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { getPlaywrightFetcher, type PlaywrightFetchResult } from './mcp/playwrightFetch';

/**
 * Cached document metadata
 */
export interface CachedDoc {
  url: string;
  title: string;
  content: string;
  textContent: string;
  cachedAt: string;
  expiresAt?: string;
}

/**
 * Cache options
 */
export interface CacheOptions {
  maxAge?: number; // Max age in milliseconds (default: 7 days)
  forceRefresh?: boolean; // Force fetch even if cached
}

/**
 * Verse Documentation Cache
 *
 * Caches fetched documentation to avoid repeated web requests.
 * Uses Playwright to bypass 403 errors on first fetch.
 */
export class VerseDocsCache {
  private cacheDir: string;
  private fetcher = getPlaywrightFetcher();

  constructor(cacheDir: string = './data/verse-docs') {
    this.cacheDir = cacheDir;
  }

  /**
   * Get cache key for a URL
   */
  private getCacheKey(url: string): string {
    const hash = createHash('sha256').update(url).digest('hex');
    return hash.slice(0, 16);
  }

  /**
   * Get cache file path for a URL
   */
  private getCacheFilePath(url: string): string {
    const key = this.getCacheKey(url);
    const category = this.categorizeUrl(url);
    return join(this.cacheDir, category, `${key}.json`);
  }

  /**
   * Categorize URL for organized storage
   */
  private categorizeUrl(url: string): string {
    if (url.includes('/devices/')) return 'devices';
    if (url.includes('language-reference')) return 'language';
    if (url.includes('tutorial') || url.includes('learn')) return 'tutorials';
    return 'api';
  }

  /**
   * Check if cached document is still valid
   */
  private isValid(doc: CachedDoc): boolean {
    if (!doc.expiresAt) return true;

    const expiresAt = new Date(doc.expiresAt);
    return expiresAt > new Date();
  }

  /**
   * Get a document (from cache or fetch)
   */
  async get(url: string, options: CacheOptions = {}): Promise<CachedDoc | null> {
    const cacheFile = this.getCacheFilePath(url);

    // Check cache first (unless force refresh)
    if (!options.forceRefresh && existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(await readFile(cacheFile, 'utf-8')) as CachedDoc;

        if (this.isValid(cached)) {
          console.log(`[Verse Cache] HIT: ${url}`);
          return cached;
        }

        console.log(`[Verse Cache] EXPIRED: ${url}`);
      } catch (error) {
        console.error(`[Verse Cache] Error reading cache:`, error);
      }
    }

    // Cache miss or expired - fetch with Playwright
    console.log(`[Verse Cache] MISS: ${url}`);
    return await this.fetch(url, options);
  }

  /**
   * Fetch and cache a document
   */
  async fetch(url: string, options: CacheOptions = {}): Promise<CachedDoc | null> {
    try {
      const result: PlaywrightFetchResult = await this.fetcher.fetch({
        url,
        waitTime: 30000,
      });

      if (!result.success) {
        console.error(`[Verse Cache] Fetch failed: ${result.error}`);
        return null;
      }

      const maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
      const cachedDoc: CachedDoc = {
        url,
        title: result.title,
        content: result.content,
        textContent: result.textContent,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + maxAge).toISOString(),
      };

      // Save to cache
      await this.save(url, cachedDoc);

      return cachedDoc;

    } catch (error) {
      console.error(`[Verse Cache] Error fetching ${url}:`, error);
      return null;
    }
  }

  /**
   * Save a document to cache
   */
  async save(url: string, doc: CachedDoc): Promise<void> {
    const cacheFile = this.getCacheFilePath(url);

    // Ensure directory exists
    await mkdir(dirname(cacheFile), { recursive: true });

    // Write to file
    await writeFile(cacheFile, JSON.stringify(doc, null, 2), 'utf-8');

    console.log(`[Verse Cache] SAVED: ${url}`);
  }

  /**
   * Get multiple documents at once
   */
  async getMany(urls: string[], options: CacheOptions = {}): Promise<Map<string, CachedDoc | null>> {
    const results = new Map<string, CachedDoc | null>();

    for (const url of urls) {
      const doc = await this.get(url, options);
      results.set(url, doc);

      // Rate limit to be nice to Epic's servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Search cached docs by keyword
   */
  async search(keyword: string): Promise<CachedDoc[]> {
    const results: CachedDoc[] = [];
    const categories = ['devices', 'language', 'tutorials', 'api'];

    for (const category of categories) {
      const categoryDir = join(this.cacheDir, category);

      if (!existsSync(categoryDir)) continue;

      const files = await Bun.file(categoryDir).exists()
        ? (await import('fs')).readdirSync(categoryDir)
        : [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const content = await readFile(join(categoryDir, file), 'utf-8');
        const doc = JSON.parse(content) as CachedDoc;

        if (
          doc.title.toLowerCase().includes(keyword.toLowerCase()) ||
          doc.textContent.toLowerCase().includes(keyword.toLowerCase())
        ) {
          results.push(doc);
        }
      }
    }

    return results;
  }
}

// Singleton instance
let cacheInstance: VerseDocsCache | null = null;

/**
 * Get the global Verse docs cache instance
 */
export function getVerseDocsCache(): VerseDocsCache {
  if (!cacheInstance) {
    cacheInstance = new VerseDocsCache();
  }
  return cacheInstance;
}
