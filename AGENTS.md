# SF Docs MCP Server — Agent Instructions

## Overview
This MCP server makes Salesforce documentation LLM-readable by converting HTML/XHTML articles to clean Markdown.

## Architecture
- **help.salesforce.com**: Uses the Salesforce Aura API directly (NO browser/Playwright). The extractor in `src/extractors/help-sf.ts` makes HTTP POST requests to the Aura endpoint to fetch article XHTML, then converts it to Markdown with Turndown.
- **developer.salesforce.com**: Uses Playwright with stealth plugin because this site uses Shadow DOM / LWC components that require a real browser.

## fwuid Rotation
Salesforce rotates the `fwuid` (framework unique ID) approximately 3 times per year — typically with major releases in **February, June, and October**. When the fwuid becomes stale:
1. The Aura API returns `state: "ERROR"` instead of `state: "SUCCESS"`
2. The extractor automatically detects this and calls `refreshFwuid()` which scrapes the homepage
3. If auto-refresh fails, manually update `KNOWN_FWUID` and `KNOWN_LOADED_HASH` in `src/extractors/help-sf.ts`

## Verification
Quick spot-check:
```bash
npm run test-url -- "https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5"
```
Expected: `pageType: "help-article"`, real article content, length > 1000 chars.

```bash
npm run test-url -- "https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html"
```
Expected: `pageType: "guide"`, real page content.

Pre-release (network required):
```bash
npm run test:release
```
Runs `regression-urls.json` cases plus smoke tests (allowlist, SQLite cache miss/hit with `SF_DOCS_CACHE_DB`, parallel scrapes, SSE listen, `analyze_page_structure` on a developer URL).

## Key Notes
- Use **Node 18–24** (LTS **20** or **22** recommended). **Node 25+** is unsupported by `engines` and often breaks `better-sqlite3` (no prebuild → native compile failures).
- `help-sf.ts` has **zero** Playwright dependency — it uses only native `fetch()`
- The `release` parameter is sent as empty string `""` to always get the latest version
- `aura.token = null` — no authentication needed for public articles
- Results are cached in SQLite (`sf-docs-cache.db`) for 24 hours; optional override via `SF_DOCS_CACHE_DB`
- MCP server `version` is read from `package.json` at runtime — keep a single source of truth there
