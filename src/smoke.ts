import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeCacheDb } from "./cache/doc-cache.js";
import { scrape, isAllowedUrl, analyzePage } from "./extractors/index.js";
import { closeBrowser } from "./extractors/base.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

function analyzeAllowedForMcp(url: string): boolean {
  try {
    return new URL(url).hostname === "developer.salesforce.com";
  } catch {
    return false;
  }
}

async function testNegativeUrlGate(): Promise<void> {
  assert(!isAllowedUrl("https://example.com/doc"), "N1: example.com must be rejected");
  assert(!isAllowedUrl("not-a-url"), "N2: malformed URL must be rejected");
  const helpSample =
    "https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5";
  assert(
    !analyzeAllowedForMcp(helpSample),
    "N3: analyze gate — help host rejected for dev-only tool"
  );
}

async function testCacheSecondHit(): Promise<void> {
  closeCacheDb();
  const dir = mkdtempSync(join(tmpdir(), "sf-docs-cache-smoke-"));
  const dbPath = join(dir, "smoke.db");
  process.env.SF_DOCS_CACHE_DB = dbPath;

  try {
    const url =
      "https://help.salesforce.com/s/articleView?id=ind.psc_create_violation_enforcement_action.htm&type=5";

    const first = await scrape(url);
    assert(!first.cached, "C1: first fetch should be cache miss");
    const second = await scrape(url);
    assert(second.cached, "C1: second fetch should be cache hit");
  } finally {
    delete process.env.SF_DOCS_CACHE_DB;
    closeCacheDb();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testConcurrentScrapes(): Promise<void> {
  const u1 =
    "https://help.salesforce.com/s/articleView?id=ind.psc_create_violation_enforcement_action.htm&type=5";
  const u2 =
    "https://help.salesforce.com/s/articleView?id=ind.psc_admin_concept_psc_welcom.htm&type=5";
  const [a, b] = await Promise.all([scrape(u1), scrape(u2)]);
  assert(a.markdown.length > 100, "M3: concurrent a");
  assert(b.markdown.length > 100, "M3: concurrent b");
}

async function testAnalyzeDeveloperRuns(): Promise<void> {
  const url =
    "https://developer.salesforce.com/docs/einstein/genai/guide/get-started.html";
  const result = await analyzePage(url);
  assert(result.url === url, "analyzer returns url");
  assert(
    result.customElements.length > 0 || result.bodyText.length > 50,
    "analyzer should return structure or body text"
  );
}

/**
 * M2: spawn serve mode; verify HTTP server responds (404 on unknown path is enough).
 */
async function testSseServerListens(): Promise<void> {
  const port = 3847 + Math.floor(Math.random() * 200);
  const child = spawn(process.execPath, ["dist/mcp-server.js", "serve"], {
    cwd: PKG_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
  });

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (stderr.includes("listening")) break;
    if (Date.now() > deadline) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      throw new Error(
        `M2: server did not log listening. stderr: ${stderr.slice(-500)}`
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const res = await fetch(`http://127.0.0.1:${port}/nope`);
  assert(res.status === 404, `M2: expected 404, got ${res.status}`);

  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

async function main(): Promise<void> {
  await testNegativeUrlGate();
  await testCacheSecondHit();
  await testConcurrentScrapes();
  await testAnalyzeDeveloperRuns();
  await testSseServerListens();
  console.error("Smoke OK: N1–N3, C1, M2, M3, analyze developer");
}

main()
  .catch((e) => {
    console.error("Smoke failed:", e);
    process.exit(1);
  })
  .finally(() => closeBrowser());
