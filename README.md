# SF Docs MCP

An [MCP](https://modelcontextprotocol.io/) server that pulls **Salesforce Help** or **Salesforce Developers** documentation and returns **clean Markdown** for assistants (for example in Cursor).

It is aimed at **solution engineers**, **admins**, and **developers**: you can use it without touching the code, or run the CLI and tests below when you need to verify a setup.

**For Claude Code install see ['Claude Code Applicability'](https://github.com/kvirtue123/sf-docs-mcp/edit/main/CLAUDE-CODE-APPLICABLITY.md).**

## Why this exists

`help.salesforce.com` serves mostly an HTML shell; article bodies load via JavaScript. **Salesforce Locker Service blocks typical browser automation** (Playwright, Puppeteer, Selenium) by detecting the Chrome DevTools Protocol, so scraping Help in a headless browser is not viable.

This server uses two paths:

- **help.salesforce.com** — Calls Salesforce's Aura API over HTTP with `fetch()` (no browser, no CDP).
- **developer.salesforce.com** — Uses Playwright with a stealth plugin, because those pages rely on Shadow DOM / LWC and need real Chromium.

Credit: The developer extractor builds on [`salesforcebob/sf-doc-scraper`](https://github.com/salesforcebob/sf-doc-scraper). The Aura-based Help path is separate.

## Requirements

- **Node.js** — Use an **LTS** release (**20.x** or **22.x** recommended). **18.x** is still allowed (`package.json` allows `>=18` and `<25`). Avoid **Node 25+** ("Current"): `better-sqlite3` often has **no prebuilt binary** for those versions, so `npm install` may try to compile native code and fail (for example missing **C++20** toolchain).
- After `npm install`, for developer docs: `npx playwright install chromium`

`package.json` declares `engines.node` as **>=18 and <25** so `npm` can warn if your Node is too new.

## Setup

The Node package is the **repository root** (the directory with `package.json`, `src/`, and `tsconfig.json`).

### Step 0 — Check your Node version first

```bash
node -v
```

- **v18, v20, v22, v23, or v24** → you're good, skip to **Step 1 (Clone & install)**.
- **v25 or higher** → switch to Node 22 before continuing (see below).
- **"command not found"** → install Node via nvm (see below).

#### Switch to Node 22 (only needed if you're on v25+ or Node is missing)

**Path A — I already have nvm:**

```bash
nvm install 22
nvm use 22
node -v   # expect v22.x.x
```

**Path B — I don't have nvm yet:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 22
nvm use 22
node -v   # expect v22.x.x
```

> The two `export`/`source` lines load nvm into your **current terminal** so you don't have to close and reopen it.

### Step 1 — Clone & install

The easiest path is the one-shot setup script — it checks your Node version, installs dependencies, compiles TypeScript, installs Chromium, runs a smoke check, and prints the absolute path you'll need for the Cursor config:

```bash
git clone https://github.com/kvirtue/sf-docs-mcp.git
cd sf-docs-mcp
npm run setup
```

Or run the steps manually if you prefer:

```bash
git clone https://github.com/kvirtue/sf-docs-mcp.git
cd sf-docs-mcp
npm install
npm run build
npx playwright install chromium   # needed for developer.salesforce.com
```

> **Windows users:** `npm run setup` requires bash and is not supported in native Windows shells (cmd.exe, PowerShell, or Git Bash). Use the manual steps above, or run from **WSL** (Windows Subsystem for Linux). Everything else — `npm install`, `npm run build`, `npx playwright install chromium` — works natively on Windows.

### If `npm install` fails on `better-sqlite3`

You are likely on Node 25+. Switch to Node 22 (see **Step 0** above), remove `node_modules`, and install again:

```bash
rm -rf node_modules
npm install
```

Also avoid odd shell errors from **spaces in the folder path** (e.g. `Documents/Web Projects/sf-docs-mcp`): `cd` into the directory first, or quote paths in scripts.

### Why is `sf-docs-mcp/` sometimes empty?

If you clone GitHub's `sf-docs-mcp` repo, the **clone directory** is often named `sf-docs-mcp`, and that directory **is** the project root — everything lives there.

If your workspace is a **parent** folder (for example you named the checkout `SF-Document-Scrape`), the real package is still the folder that contains `package.json` and `src/`. An **extra** empty `sf-docs-mcp/` next to those files is not the app; it is safe to remove (`rmdir sf-docs-mcp` if it is empty).

## Cursor (MCP)

This repo includes **project-level** MCP config in [`.cursor/mcp.json`](.cursor/mcp.json). It runs:

`${workspaceFolder}/dist/mcp-server.js`

> **Important:** Open this repository **as the workspace folder** (the directory that contains `package.json` and `src/`) in Cursor, then **reload MCP** or restart Cursor.
>
> **If sf-docs-mcp is a sub-folder of another workspace** (e.g. you cloned it inside an existing project), the project-level `.cursor/mcp.json` will **not** work because `${workspaceFolder}` resolves to the parent. Use the **global config** below instead.

### Adding to global `~/.cursor/mcp.json`

`npm run setup` prints the exact absolute path to `dist/mcp-server.js` — copy that value into the config below.

**If `~/.cursor/mcp.json` does not exist yet**, create it with:

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

**If `~/.cursor/mcp.json` already has other servers**, add only the inner key inside the existing `"mcpServers"` object (don't paste the outer wrapper — that causes a JSON parse error):

```jsonc
// Inside the existing "mcpServers": { ... } block, after the last server entry:
"sf-docs": {
  "command": "node",
  "args": ["/absolute/path/to/clone/dist/mcp-server.js"]
}
```

> On macOS, the absolute path may contain spaces (e.g. a Google Drive path like `.../My Drive/...`). JSON strings handle spaces fine — no quoting tricks needed.

After saving, **reload MCP** in Cursor (Command Palette → "MCP: Reload Servers") or restart Cursor.

## Tools

| Tool | Description |
|------|-------------|
| `scrape_sf_docs` | Give a full **Help** or **Developer** docs URL; get back Markdown plus a short header (title, source, type, whether it came from cache, timestamp). |
| `analyze_page_structure` | **developer.salesforce.com only** — inspect the page's DOM / shadow roots / custom elements when a scrape returns little or no text. |

Only these two hosts are accepted: `help.salesforce.com` and `developer.salesforce.com`.

## Using this in chat

The tools **fetch one page at a time**. Everything else—summaries, comparisons, checklists—is something you ask your **assistant** to do in normal language after the text arrives.

**Examples:**

- "Use **scrape_sf_docs** on [URL] and give me **five bullets** for a customer email."
- "Scrape [URL] and **list the steps** in order for someone who is not technical."
- "Scrape [URL A] and [URL B], then **compare** permissions or editions in a **small table**."
- "Scrape [URL] and **answer** whether mobile users can do X, citing the doc."
- If Developer Markdown looks empty: "Run **analyze_page_structure** on that URL and explain what might be blocking the content."

You can work through **many URLs in one conversation** (one scrape per link is typical). This is **not** a general web crawler: it does **not** support random websites, Trailhead unless the page lives on one of the two hosts above, or logging into private Help.

## Scope, limits, and what "good" looks like

**Which "sites" are supported?**  
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

## Troubleshooting

- **`npm install` / `better-sqlite3` and C++ or compile errors** — You are likely on Node 25+ or an unsupported version. Switch to Node **22** or **20** (see **Step 0** above).
- **`EBADENGINE` from npm** — Often a warning only; if the install still fails on `better-sqlite3`, fix Node version as above.
- **`nvm: command not found` after running the curl install** — nvm was installed but hasn't been loaded yet. Run the two `export`/`source` lines from **Path B** above, then retry `nvm install 22`.
- **Help articles empty or errors after a Salesforce release** — Aura `fwuid` rotates ~3x/year; the server tries to refresh automatically. If it keeps failing, see **Salesforce `fwuid`** and `src/extractors/help-sf.ts` (`KNOWN_FWUID`, `KNOWN_LOADED_HASH`).
- **Developer pages return little or no Markdown** — Prefer guide URLs (`/docs/.../guide/...`); use `analyze_page_structure` to diagnose. See **Scope, limits** above.
- **`npx playwright install chromium` slow or fails** — Downloads a Chromium binary (~150 MB); needs network and disk space. Only required for **developer.salesforce.com**; Help does not use Playwright.

## Verify locally

```bash
npm run test-url -- "https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5"
npm run test-url -- "https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html"
```

Expected: Help returns `pageType: "help-article"` with substantial body text; Developer returns `pageType: "guide"` with Markdown.

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
| `npm run setup` | One-shot install + build + Playwright + smoke check; prints Node version guidance and the absolute path to `dist/mcp-server.js` |
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
