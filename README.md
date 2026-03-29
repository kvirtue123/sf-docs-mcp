# SF Docs MCP

An [MCP](https://modelcontextprotocol.io/) server that pulls **Salesforce Help** or **Salesforce Developers** documentation and returns **clean Markdown** for assistants (for example in Cursor).

It is aimed at **solution engineers**, **admins**, and **developers**: you can use it without touching the code, or run the CLI and tests below when you need to verify a setup.

- **help.salesforce.com** — fetched over HTTP via Salesforce’s Aura API (no browser on your machine).
- **developer.salesforce.com** — fetched with Playwright and a stealth plugin, because those pages use Shadow DOM / LWC and need a real Chromium instance.

## Requirements

- **Node.js** — Use an **LTS** release (**20.x** or **22.x** recommended; **18.x** is still allowed). Avoid **Node 25+** (“Current”): `better-sqlite3` often has **no prebuilt binary** for those versions, so `npm install` may try to compile native code and fail (for example missing **C++20** flags on your machine).
- After `npm install`, for developer docs: `npx playwright install chromium`

`package.json` declares `engines.node` as **>=18 and <25** so `npm` can warn if your Node is too new.

### If `npm install` fails on `better-sqlite3`

Switch to Node **22** or **20**, remove `node_modules`, and install again:

```bash
# Example with nvm
nvm install 22
nvm use 22
node -v   # expect v22.x.x

cd sf-docs-mcp
rm -rf node_modules
npm install
```

Also avoid odd shell errors from **spaces in the folder path** (e.g. `Web Surfing/sf-docs-mcp`): `cd` into the directory first, or quote paths in scripts.

## Setup

```bash
git clone https://github.com/kvirtue/sf-docs-mcp.git
cd sf-docs-mcp
npm install
npm run build
npx playwright install chromium   # needed for developer.salesforce.com
```

## Cursor (MCP)

This repo includes **project-level** MCP config in [`.cursor/mcp.json`](.cursor/mcp.json). It runs:

`${workspaceFolder}/dist/mcp-server.js`

**In Cursor:** open this repository as the workspace folder (the directory that contains `package.json` and `src/`), then **reload MCP** or restart Cursor.

If Cursor is pointed at a **different** workspace, add the server under **global** MCP config instead (`~/.cursor/mcp.json`) with an **absolute** path to `dist/mcp-server.js` inside your clone:

```json
{
  "mcpServers": {
    "sf-docs": {
      "command": "node",
      "args": ["/absolute/path/to/clone/dist/mcp-server.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `scrape_sf_docs` | Give a full **Help** or **Developer** docs URL; get back Markdown plus a short header (title, source, type, whether it came from cache, timestamp). |
| `analyze_page_structure` | **developer.salesforce.com only** — inspect the page’s DOM / shadow roots / custom elements when a scrape returns little or no text. |

Only these two hosts are accepted: `help.salesforce.com` and `developer.salesforce.com`.

## Using this in chat

The tools **fetch one page at a time**. Everything else—summaries, comparisons, checklists—is something you ask your **assistant** to do in normal language after the text arrives.

**Examples:**

- “Use **scrape_sf_docs** on [URL] and give me **five bullets** for a customer email.”
- “Scrape [URL] and **list the steps** in order for someone who is not technical.”
- “Scrape [URL A] and [URL B], then **compare** permissions or editions in a **small table**.”
- “Scrape [URL] and **answer** whether mobile users can do X, citing the doc.”
- If Developer Markdown looks empty: “Run **analyze_page_structure** on that URL and explain what might be blocking the content.”

You can work through **many URLs in one conversation** (one scrape per link is typical). This is **not** a general web crawler: it does **not** support random websites, Trailhead unless the page lives on one of the two hosts above, or logging into private Help.

## Scope, limits, and what “good” looks like

**Which “sites” are supported?**  
Only the two Salesforce doc domains above. Within them, you can request as many **individual article or guide URLs** as you need; the server has been smoke-tested with concurrent scrapes, though your editor may still run tool calls sequentially.

**How much content?**  
Roughly **one public page per request**, converted to Markdown. There is no hard cap in code; very long pages produce very long text (watch context limits in your AI product). Help articles can occasionally return an error instead of content (bad or missing Aura record); after major Salesforce releases, Help can fail until the Aura `fwuid` refresh logic catches up (see **Salesforce `fwuid`** below).

**Developer docs specifically:**  
Pages are loaded with about a **30 second** navigation timeout. Many legacy **Atlas reference** HTML pages still come back as **empty Markdown** even though the site looks fine in a browser; **guide** URLs under paths like `/docs/.../guide/...` are more reliable. When verifying a setup, check `pageType` and body length:

- **Help:** `pageType: help-article` and plenty of body text.
- **Developer:** `pageType: guide` or `reference` (or `developer-article` depending on URL pattern) **and** non-empty Markdown—prefer guides when you need predictable results (see [`regression-urls.json`](regression-urls.json) for examples).

## Cache and the SQLite file

Successful responses are cached in **SQLite** for **24 hours** so repeat questions on the **exact same URL** are fast. Default file: **`sf-docs-cache.db`** next to `package.json`.

The table is named `cache` and holds: `url`, `title`, `markdown`, `pageType`, `extractedAt`, `expiresAt`. This is a **local cache of public docs you already fetched**, not data from your Salesforce org.

**Practical reuse:**

- **Most of the time** you do not need SQL—ask the assistant to **scrape again**; cache makes the second call quick.
- To **reuse outside chat**, copy from the assistant response, or ask the assistant to **save** the Markdown as a `.md` file in your project.
- To **inspect or export** raw rows, open `sf-docs-cache.db` with any SQLite viewer (e.g. DB Browser for SQLite) and query the `markdown` column.
- **Clear cache:** stop the MCP server, delete `sf-docs-cache.db`, restart.
- **Custom database path:** set `SF_DOCS_CACHE_DB` to an absolute path before starting the server (tests or separate cache per project).

## Verify locally

```bash
npm run test-url -- "https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5"
npm run test-url -- "https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html"
```

### Pre-release testing (for distributors)

Before tagging or handing the package to other solution engineers:

1. **Environment matrix** — On **macOS, Windows, or Linux** (as applicable), run `npm ci`, `npm run build`, `npm run typecheck`, and `npx playwright install chromium`. Confirm **Node 22.x** (or **20.x**; **18.x** if you still support it). Avoid **Node 25+** for `npm install` (see **Requirements**).
2. **Automated suite** (requires network):

   ```bash
   npm run test:release
   ```

   This runs `test:regression` (canonical URLs in [`regression-urls.json`](regression-urls.json), including a help Aura error case and several developer guides) and `test:smoke` (URL allowlist, cache hit/miss, parallel scrapes, SSE listen probe, DOM analyzer).

3. **Cursor stdio** — Reload MCP in Cursor and confirm `scrape_sf_docs` returns Markdown for a help URL and a developer URL.

4. **Release checklist** — Document Node + `npm ci`/`npm install`, `npx playwright install chromium`, and the absolute path to `dist/mcp-server.js`. Bump `version` in [`package.json`](package.json) only; the MCP server reads that version at startup (no duplicate literal in code).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Typecheck without emitting |
| `npm run start` | Run MCP over **stdio** (default for Cursor) |
| `npm run serve` | HTTP + SSE on `PORT` (default `3000`) — for SSE-capable clients |
| `npm run test-url -- "<url>"` | Scrape one URL and print metadata + preview |
| `npm run test:regression` | Run all cases in `regression-urls.json` (network) |
| `npm run test:smoke` | Negative tests, cache behavior, concurrency, SSE server stub (network) |
| `npm run test:release` | `test:regression` then `test:smoke` |

## Salesforce `fwuid` (help site)

Salesforce rotates the Aura `fwuid` roughly **three times per year** (often around Feb / Jun / Oct). The extractor tries to refresh automatically. If help articles fail consistently after a release, see `AGENTS.md` and `src/extractors/help-sf.ts` (`KNOWN_FWUID`, `KNOWN_LOADED_HASH`).

## Further reading

- `AGENTS.md` — architecture, verification, operational notes  
- `SKILL.md` — when to use each tool (for agent / skill authors)
