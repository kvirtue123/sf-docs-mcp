# Claude Code Installation — sf-docs-mcp

## 1. How to wire it up

After running `npm run setup` in the repo, copy the absolute path it prints for `dist/mcp-server.js`. Then register the server with Claude Code:

**Option A — CLI (fastest, recommended):**

```bash
# User scope = available in every Claude Code session on this machine
claude mcp add --scope user sf-docs node /absolute/path/to/sf-docs-mcp/dist/mcp-server.js

# Or project scope = committed to the repo's .mcp.json and shared with the team
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

After either path, run `/mcp` inside Claude Code to verify that `sf-docs` shows as connected and exposes `scrape_sf_docs` and `analyze_page_structure`.

**Scope guidance:**
- `--scope user` — keep the server private to you; good for SEs using the tool across many customer repos.
- `--scope project` — commits `.mcp.json` with the server definition; teammates who clone the repo still need to run `npm run setup` locally (the `.mcp.json` references an absolute local path to `dist/mcp-server.js`). Good for Salesforce-heavy team codebases where everyone works on the same machine OS.

## 2. Transport compatibility

| Transport | Server supports? | Claude Code supports? | Recommended for |
|-----------|------------------|-----------------------|-----------------|
| stdio     | Yes (default `npm run start`) | Yes | Local use — this is the right default |
| SSE       | Yes (`npm run serve`) | Yes | Rare; remote or multi-client deployments only |
| HTTP      | No | Yes | Not applicable |

**Recommendation:** stdio. The SSE mode exists for IDEs that don't spawn subprocesses (some web clients); Claude Code spawns fine, so stdio is simpler and avoids the extra HTTP listener.

## 3. Tool-surface fit

The server exposes exactly two tools, both of which map cleanly onto Claude Code workflows:

- **`scrape_sf_docs(url)`** — single tool call returns clean Markdown plus a short metadata header (title, source, page type, cache flag, timestamp). Ideal for:
  - Reading a Help article inline while writing Apex or LWC code.
  - Citing documentation in PR descriptions (`gh pr create`) without leaving the terminal.
  - Comparing two doc pages in a single agent turn.
- **`analyze_page_structure(url)`** — diagnostic tool for `developer.salesforce.com` pages that come back with empty Markdown. Returns custom elements, shadow DOM tags, and a suggested selector. Rarely needed, but valuable when it is.

Tool count is small by design — Claude Code respects that MCP tool lists contribute to context. Two tools add minimal overhead per turn.

## 4. Where it shines for Claude Code users

- **Solution Engineers** drafting customer-ready summaries: `scrape_sf_docs https://help.salesforce.com/... → rewrite as five bullets for a non-technical buyer`.
- **Developers** porting legacy guides: scrape a `/docs/.../guide/...` page, then ask the agent to convert steps into a working Apex class or LWC.
- **Long agent runs**: the 24-hour SQLite cache (`sf-docs-cache.db`) makes repeat reads of the same URL essentially free — useful when an agent revisits the same reference material across many sub-tasks.
- **No auth ceremony**: public docs don't require a Salesforce login, so the tool works from any machine with network.

## 5. Where it is a poor fit

- **Only two hosts are allowlisted** (`help.salesforce.com`, `developer.salesforce.com`). For general web research, you still need `WebFetch` or a broader browser MCP.
- **Atlas reference pages** (`/docs/atlas...ref.meta/...`) often return empty Markdown even when the page looks fine in a browser. Prefer `guide` URLs whenever a guide version exists.
- **Developer docs are slow** — each call boots Playwright Chromium and navigates, which costs several seconds. Noticeable when an agent chains many developer URLs in one turn.
- **No authentication** means Help pages behind a login (private knowledge bases, customer-specific help) are unreachable.
- **`fwuid` rotation** (~3×/year, typically Feb/Jun/Oct) can temporarily break Help scraping until the self-healing regex catches up or `KNOWN_FWUID` is manually bumped.
- **Airgapped / offline** environments: does not work. Both extractors make outbound HTTPS.

## 6. Claude Code–specific considerations

### Permissions prompts

The first time Claude Code calls `scrape_sf_docs`, the user is prompted to approve the tool. For teams that use this frequently, allowlist it in `.claude/settings.json`:

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

The built-in `fewer-permission-prompts` skill can generate this allowlist automatically after a few sessions.

### Context budget

A single long Help article can return **20–60 KB** of Markdown. If you pipe the full result into a downstream prompt ("now summarize…"), the article will dominate context. Good patterns:

- Ask for the summary in the *same* turn as the scrape so the raw Markdown falls out of context sooner.
- Use the cache intentionally: scrape once, ask follow-up questions in later turns (the cache returns the same Markdown, so the agent can re-read without another network call).

### Node version

Same constraint as the base project: **Node 18–24**. Claude Code users on Node 25+ will hit `better-sqlite3` native-build failures during `npm install`. Recommend Node 22 LTS via `nvm`.

### Cache location

The default cache lives at `sf-docs-cache.db` next to `package.json`. If you want a per-project cache (so scrapes for Customer A don't bleed into Customer B's sessions), set `SF_DOCS_CACHE_DB` to an absolute path in the project's MCP config via the `env` field.

## 7. Comparison snapshot

| Option | Works on help.salesforce.com? | Works on developer.salesforce.com? | Notes |
|--------|--------------------------------|--------------------------------------|-------|
| **sf-docs-mcp** | Yes (Aura API, fast) | Yes (Playwright, ~3–10 s) | Purpose-built, 24 h cache, clean Markdown |
| Claude Code `WebFetch` | No usable content — Help is an HTML shell; article body loads via JS | Partial — guide pages sometimes render server-side | Free, built-in, but returns empty / noisy for most SF docs |
| Generic headless-browser MCP (Puppeteer/Playwright) | No — Salesforce Locker Service detects CDP and blocks | Yes, usually | Works for developer docs but duplicates what sf-docs-mcp already handles |
| Manual copy/paste from browser | Yes | Yes | No automation; agent cannot re-read or diff |

## 8. Recommendation

**Install it** if you:
- Spend at least a few hours per week in `help.salesforce.com` or `developer.salesforce.com` while working in Claude Code.
- Are a Solution Engineer, Salesforce developer, or admin who generates customer-facing documentation, PR descriptions, or onboarding material from SF docs.
- Want repeatable, diffable access to the same article across sessions.

**Skip it** if you:
- Rarely touch Salesforce documentation from the CLI.
- Work exclusively offline or in airgapped environments.
- Already have a general-purpose doc-ingest MCP that covers these two hosts with similar quality.

## 9. Quick verification in Claude Code

After `claude mcp add ...`, drop into a session and try:

```
Use scrape_sf_docs on https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5 and give me five bullets a new AE could send to a prospect.
```

Expected: clean five-bullet output, no raw HTML, no auth prompts, cached second-call in the same session.

```
Use scrape_sf_docs on https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html and list the prerequisites in order.
```

Expected: ordered list of prerequisites drawn from the guide body.

**If the developer URL returns empty Markdown:** run `analyze_page_structure` on the same URL to inspect its DOM structure and get a suggested selector. `analyze_page_structure` only accepts `developer.salesforce.com` URLs — the MCP server rejects Help URLs outright.

**If the Help URL fails or returns empty Markdown:** this is an Aura API issue, not a browser/DOM issue. Check the `fwuid` state. The warning introduced in `help-sf.ts` will appear in the MCP server's stderr if the homepage regex missed. If failures persist after a Salesforce release, update `KNOWN_FWUID` and `KNOWN_LOADED_HASH` in `src/extractors/help-sf.ts` (see `AGENTS.md` for the procedure). `WebFetch` and browser-based tools are not alternatives — Help article bodies are not in the HTML shell, and Locker Service blocks CDP-based automation entirely.
