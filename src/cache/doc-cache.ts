import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CacheEntry, ExtractResult } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Override with absolute path for tests or isolated cache (default: sf-docs-cache.db in package root). */
function getDbPath(): string {
  const override = process.env.SF_DOCS_CACHE_DB?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(__dirname, "..", "..", "sf-docs-cache.db");
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        url TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        pageType TEXT NOT NULL,
        extractedAt TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      )
    `);
  }
  return db;
}

export function getCached(url: string): ExtractResult | null {
  const row = getDb()
    .prepare("SELECT * FROM cache WHERE url = ? AND expiresAt > ?")
    .get(url, Date.now()) as CacheEntry | undefined;

  if (!row) return null;

  return {
    title: row.title,
    markdown: row.markdown,
    url,
    pageType: row.pageType,
    cached: true,
    extractedAt: row.extractedAt,
  };
}

export function setCache(result: ExtractResult): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO cache (url, title, markdown, pageType, extractedAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      result.url,
      result.title,
      result.markdown,
      result.pageType,
      result.extractedAt,
      Date.now() + TTL_MS
    );
}

/** Close the DB handle so the next getDb() picks up a possibly new `SF_DOCS_CACHE_DB`. */
export function closeCacheDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}
