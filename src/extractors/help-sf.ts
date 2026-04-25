import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { Extractor, ExtractResult } from "../types.js";

const BASE_URL = "https://help.salesforce.com";
const AURA_ENDPOINT = `${BASE_URL}/s/sfsites/aura?r=30&aura.ApexAction.execute=1`;

// Fallback values — will be refreshed automatically from the homepage
let KNOWN_FWUID =
  "VEhtaDlVRkdCeTJiZFhuOTVYYjRJQTJEa1N5enhOU3R5QWl2VzNveFZTbGcxMy4tMjE0NzQ4MzY0OC4xMzEwNzIwMA";
let KNOWN_LOADED_HASH = "1533_ez-GoXD6UAAJ6rtTbHErdw";
const KNOWN_RELEASE_FALLBACK = "260.0.0";

let cachedFwuid: string | null = null;
let cachedLoadedHash: string | null = null;
let cachedRelease: string | null = null;
let fwuidCachedAt = 0;
const FWUID_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Emit each fallback warning at most once per process lifetime to avoid
// spamming stderr when the homepage regex consistently misses (e.g. after
// a Salesforce release changes the marker format). We still re-scrape on
// every call in this state — only the warning is suppressed after the first.
let hasWarnedFwuidFallback = false;
let hasWarnedLoadedHashFallback = false;

interface AuraConfig {
  fwuid: string;
  loadedHash: string;
  release: string;
}

/**
 * Scrape the help.salesforce.com homepage to extract the current fwuid,
 * loaded application hash, and release version.
 *
 * If either regex misses, we return the hard-coded KNOWN_* fallbacks but
 * deliberately do NOT update fwuidCachedAt — the next call will re-scrape
 * rather than serving the frozen constants for 12 h.
 */
async function refreshFwuid(): Promise<AuraConfig> {
  const now = Date.now();
  if (
    cachedFwuid &&
    cachedLoadedHash &&
    cachedRelease &&
    now - fwuidCachedAt < FWUID_TTL_MS
  ) {
    return { fwuid: cachedFwuid, loadedHash: cachedLoadedHash, release: cachedRelease };
  }

  const res = await fetch(BASE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    },
  });
  const html = await res.text();

  const fwuidMatch = html.match(/"fwuid"\s*:\s*"([^"]+)"/);
  const loadedMatch = html.match(
    /"APPLICATION@markup:\/\/siteforce:communityApp"\s*:\s*"([^"]+)"/
  );
  // Extract release version from the page (e.g. "260.0.0")
  const releaseMatch = html.match(/siteUserRelease[=:]["']?(\d+\.\d+\.\d+)/);

  let usedFallback = false;

  if (fwuidMatch) {
    cachedFwuid = fwuidMatch[1];
  } else {
    if (!hasWarnedFwuidFallback) {
      console.warn(
        "[sf-docs-mcp] refreshFwuid: fwuid regex missed — using KNOWN_FWUID fallback (may be stale). Update KNOWN_FWUID in help-sf.ts if Help articles keep failing."
      );
      hasWarnedFwuidFallback = true;
    }
    cachedFwuid = KNOWN_FWUID;
    usedFallback = true;
  }

  if (loadedMatch) {
    cachedLoadedHash = loadedMatch[1];
  } else {
    if (!hasWarnedLoadedHashFallback) {
      console.warn(
        "[sf-docs-mcp] refreshFwuid: loadedHash regex missed — using KNOWN_LOADED_HASH fallback (may be stale). Update KNOWN_LOADED_HASH in help-sf.ts if Help articles keep failing."
      );
      hasWarnedLoadedHashFallback = true;
    }
    cachedLoadedHash = KNOWN_LOADED_HASH;
    usedFallback = true;
  }

  cachedRelease = releaseMatch ? releaseMatch[1] : KNOWN_RELEASE_FALLBACK;

  // Only freeze the cache when both critical values came from the live page.
  // On fallback, leave fwuidCachedAt at 0 so the next call re-scrapes.
  if (!usedFallback) {
    fwuidCachedAt = now;
  }

  return { fwuid: cachedFwuid, loadedHash: cachedLoadedHash, release: cachedRelease };
}

/** Reset fwuid cache so next call re-scrapes the homepage */
function resetFwuidCache(): void {
  cachedFwuid = null;
  cachedLoadedHash = null;
  fwuidCachedAt = 0;
}

/**
 * Parse the urlName from a help.salesforce.com article URL.
 * E.g. ?id=ind.psc_admin_concept_psc_welcom.htm → ind.psc_admin_concept_psc_welcom.htm
 */
function parseUrlName(url: string): string {
  const u = new URL(url);
  const id = u.searchParams.get("id");
  if (!id) {
    throw new Error(`No ?id= parameter found in URL: ${url}`);
  }
  return id;
}

/**
 * Call the Salesforce Aura API to get article data.
 */
async function callGetData(
  urlName: string,
  fwuid: string,
  loadedHash: string,
  release: string
): Promise<{ state: string; returnValue?: any; error?: any }> {
  const message = JSON.stringify({
    actions: [
      {
        id: "130;a",
        descriptor: "aura://ApexActionController/ACTION$execute",
        callingDescriptor: "UNKNOWN",
        params: {
          namespace: "",
          classname: "Help_ArticleDataController",
          method: "getData",
          params: {
            articleParameters: {
              urlName,
              language: "en_US",
              release,
              requestedArticleType: "HelpDocs",
              requestedArticleTypeNumber: "5",
            },
          },
          cacheable: false,
          isContinuation: false,
        },
      },
    ],
  });

  const auraContext = JSON.stringify({
    mode: "PROD",
    fwuid,
    app: "siteforce:communityApp",
    loaded: {
      "APPLICATION@markup://siteforce:communityApp": loadedHash,
    },
    dn: [],
    globals: {},
    uad: true,
  });

  const body = new URLSearchParams({
    message,
    "aura.context": auraContext,
    "aura.pageURI": `/s/articleView?id=${urlName}&type=5`,
    "aura.token": "null",
  });

  const res = await fetch(AURA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      Origin: BASE_URL,
      Referer: `${BASE_URL}/s/articleView?id=${urlName}&type=5`,
      "x-sfdc-lds-endpoints":
        "ApexActionController.execute:Help_ArticleDataController.getData",
    },
    body: body.toString(),
  });

  const json = await res.json();
  const action = json.actions?.[0];
  if (!action) {
    throw new Error("No action in Aura response");
  }
  return action;
}

/**
 * Strip the <head> section and extract <body> innerHTML from XHTML.
 */
function extractBodyHtml(xhtml: string): string {
  // Remove everything up to and including </head>
  let html = xhtml.replace(/^[\s\S]*?<\/head>\s*/i, "");
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  return html;
}

/** Setup Turndown with GFM plugin */
function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  td.use(gfm);

  // Convert SF internal links to full URLs
  td.addRule("sfLinks", {
    filter: (node) =>
      node.nodeName === "A" &&
      node.getAttribute("href")?.startsWith("/apex/HTViewHelpDoc") === true,
    replacement: (content, node) => {
      const href = (node as HTMLElement).getAttribute("href");
      return `[${content}](${BASE_URL}${href})`;
    },
  });

  return td;
}

export class HelpSfExtractor implements Extractor {
  canHandle(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname === "help.salesforce.com";
    } catch {
      return false;
    }
  }

  async extract(url: string): Promise<ExtractResult> {
    const urlName = parseUrlName(url);
    let { fwuid, loadedHash, release } = await refreshFwuid();

    let action = await callGetData(urlName, fwuid, loadedHash, release);

    // Self-healing: if fwuid is stale, refresh and retry once
    if (action.state === "ERROR") {
      resetFwuidCache();
      const refreshed = await refreshFwuid();
      fwuid = refreshed.fwuid;
      loadedHash = refreshed.loadedHash;
      release = refreshed.release;
      action = await callGetData(urlName, fwuid, loadedHash, release);
    }

    if (action.state !== "SUCCESS") {
      throw new Error(
        `Aura API returned state="${action.state}": ${JSON.stringify(action.error ?? action)}`
      );
    }

    const record = action.returnValue?.returnValue?.record;
    if (!record) {
      throw new Error("No record in Aura API response");
    }

    const contentXhtml: string = record.Content__c ?? "";
    const title: string = record.Title__c ?? "Untitled";

    const bodyHtml = extractBodyHtml(contentXhtml);
    const td = createTurndown();
    const markdown = td.turndown(bodyHtml).trim();

    return {
      title,
      markdown,
      url,
      pageType: "help-article",
      cached: false,
      extractedAt: new Date().toISOString(),
    };
  }
}
