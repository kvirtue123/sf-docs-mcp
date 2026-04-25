# Claude Code Installation — sf-docs-mcp

## Prerequisites

Before you start, confirm these are installed:

- **Git** — `git --version`
- **Node 18–24** — `node --version` (Node 22 LTS via `nvm` is recommended)
- **npm** — comes with Node
- **Claude Code CLI** — `claude --version`

---

## 1. Clone and build

```bash
git clone https://github.com/kvirtue123/sf-docs-mcp.git
cd sf-docs-mcp
npm install
npm run build
```

After the build, get the absolute path to the server entry point:

```bash
pwd
# example output: /Users/you/sf-docs-mcp
# your full server path will be: /Users/you/sf-docs-mcp/dist/mcp-server.js
```

Use that path in the registration commands below.

---

## 2. Register with Claude Code

**Option A — CLI (fastest, recommended):**

```bash
# User scope — available in every Claude Code session on this machine
claude mcp add --scope user sf-docs node /absolute/path/to/sf-docs-mcp/dist/mcp-server.js

# Project scope — committed to the repo's .mcp.json and shared with the team
claude mcp add --scope project sf-docs node /absolute/path/to/sf-docs-mcp/dist/mcp-server.js
```

**Option B — Hand-edit `~/.claude.json` (or project `.mcp.json`):**

```jsonc
{
  "mcpServers": {
    "sf-docs": {
      "command": "node",
      "args": ["/absolute/path/to/sf-docs-mcp/dist/mcp-server.js"]
    }
  }
}
```

After either option, run `/mcp` inside Claude Code to confirm `sf-docs` shows as connected and exposes `scrape_sf_docs` and `analyze_page_structure`.

**Scope guidance:**

- `--scope user` — keeps the server private to you; good for SEs working across many customer repos.
- `--scope project` — commits `.mcp.json` with the server definition. Teammates who clone the repo still need to run `npm install && npm run build` locally because `.mcp.json` references an absolute local path to `dist/mcp-server.js`.

---

## 3. Transport compatibility

| Transport | Server supports? | Claude Code supports? | Recommended for |
|-----------|------------------|-----------------------|-----------------|
| stdio | Yes (`npm run start`) | Yes | Local use — the right default |
| SSE | Yes (`npm run serve`) | Yes | Rare; remote or multi-client deployments only |
| HTTP | No | Yes | Not applicable |

**Recommendation:** stdio. Claude Code spawns subprocesses fine, so stdio is simpler and avoids an extra HTTP listener.

---

## 4. Tools exposed

The server exposes exactly two tools:

- **`scrape_sf_docs(url)`** — fetches a doc page and returns clean Markdown plus a metadata header (title, source, page type, cache flag, timestamp). Use it for:
  - Reading a Help article inline while writing Apex or LWC code.
  - Citing documentation in PR descriptions without leaving the terminal.
  - Comparing two doc pages in a single agent turn.

- **`analyze_page_structure(url)`** — diagnostic tool for `developer.salesforce.com` pages that return empty Markdown. Returns custom elements, shadow DOM tags, and a suggested selector. `developer.salesforce.com` only — the server rejects Help URLs.

Two tools add minimal context overhead per turn.

---

## 5. Where it shines

- **Solution Engineers** drafting customer summaries: scrape a Help article, then ask the agent to rewrite it as five bullets for a non-technical buyer.
- **Developers** porting legacy guides: scrape a `/docs/.../guide/...` page, then ask the agent to convert steps into a working Apex class or LWC component.
- **Long agent runs**: the 24-hour SQLite cache (`sf-docs-cache.db`) makes repeat reads of the same URL essentially free.
- **No auth ceremony**: public docs require no Salesforce login — works from any machine with network access.

---

## 6. Where it is a poor fit

- **Only two hosts are allowlisted** (`help.salesforce.com`, `developer.salesforce.com`). For general web research, use `WebFetch` or a broader browser MCP.
- **Atlas reference pages** (`/docs/atlas...ref.meta/...`) often return empty Markdown even when they look fine in a browser. Prefer `guide` URLs when a guide version exists.
- **Developer docs are slow** — each call launches Playwright Chromium and navigates, costing several seconds per page.
- **No authentication** — Help pages behind a login (private knowledge bases, customer-specific help) are unreachable.
- **`fwuid` rotation** (~3×/year, typically Feb/Jun/Oct) can temporarily break Help scraping until the self-healing logic catches up or `KNOWN_FWUID` is manually updated.
- **Airgapped / offline** environments are not supported — both extractors make outbound HTTPS calls.

---

## 7. Claude Code–specific considerations

### Permissions prompts

The first time Claude Code calls `scrape_sf_docs`, it will prompt you to approve the tool. To skip prompts for teams that use it frequently, allowlist the tools in `.claude/settings.json`:

```jsonc
{
  "permissions": {
    "allow": [
      "mcp__sf-docs__scrape_sf_docs",
      "mcp__sf-docs__analyze_page_structure"
    ]
  }
}
```

### Context budget

A single long Help article can return **20–60 KB** of Markdown. Good patterns:

- Ask for the summary in the **same turn** as the scrape so the raw Markdown leaves context sooner.
- Use the cache intentionally: scrape once, then ask follow-up questions in later turns.

### Node version

Same constraint as the base project: **Node 18–24**. Node 25+ users will hit `better-sqlite3` native-build failures during `npm install`. Use Node 22 LTS via `nvm`.

### Cache location

The default cache is `sf-docs-cache.db` next to `package.json`. For a per-project cache (so scrapes for Customer A don't bleed into Customer B's sessions), set `SF_DOCS_CACHE_DB` to an absolute path in the project's MCP config via the `env` field.

---

## 8. Comparison snapshot

| Option | help.salesforce.com | developer.salesforce.com | Notes |
|--------|---------------------|--------------------------|-------|
| **sf-docs-mcp** | Yes (Aura API, fast) | Yes (Playwright, ~3–10 s) | Purpose-built, 24 h cache, clean Markdown |
| Claude Code `WebFetch` | No — Help is an HTML shell; article body loads via JS | Partial — some guide pages render server-side | Free and built-in, but returns empty or noisy content for most SF docs |
| Generic headless-browser MCP | No — Locker Service detects CDP and blocks | Yes, usually | Works for developer docs but duplicates what sf-docs-mcp already handles |
| Manual copy/paste | Yes | Yes | No automation; agent cannot re-read or diff |

---

## 9. Recommendation

**Install it** if you:

- Spend several hours per week in `help.salesforce.com` or `developer.salesforce.com` while working in Claude Code.
- Are a Solution Engineer, Salesforce developer, or admin who generates customer-facing docs, PR descriptions, or onboarding material from SF docs.
- Want repeatable, diffable access to the same article across sessions.

**Skip it** if you:

- Rarely touch Salesforce documentation from the CLI.
- Work exclusively offline or in airgapped environments.
- Already have a general-purpose doc-ingest MCP that covers these two hosts with similar quality.

---

## 10. Quick verification

After `claude mcp add ...`, open a Claude Code session and try:

```
Use scrape_sf_docs on https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5 and give me five bullets a new AE could send to a prospect.
```

Expected: clean five-bullet output, no raw HTML, no auth prompts. A second call in the same session should return `Cached: true`.

```
Use scrape_sf_docs on https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html and list the prerequisites in order.
```

Expected: an ordered list of prerequisites drawn from the guide body.

---

## 11. Troubleshooting

**Developer URL returns empty Markdown:**
Run `analyze_page_structure` on the same URL to inspect its DOM structure and get a suggested selector. This tool only accepts `developer.salesforce.com` URLs.

**Help URL fails or returns empty Markdown:**
This is an Aura API issue, not a browser or DOM issue. Check the `fwuid` state — a warning in the MCP server's stderr indicates the homepage regex missed. If failures persist after a Salesforce release, update `KNOWN_FWUID` and `KNOWN_LOADED_HASH` in `src/extractors/help-sf.ts` (see `AGENTS.md` for the procedure).

> `WebFetch` and browser-based tools are not alternatives for Help — article bodies are not present in the HTML shell, and Salesforce Locker Service blocks CDP-based automation entirely.
