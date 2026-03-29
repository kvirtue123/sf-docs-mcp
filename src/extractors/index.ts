import { HelpSfExtractor } from "./help-sf.js";
import { DeveloperSfExtractor } from "./developer-sf.js";
import { getCached, setCache } from "../cache/doc-cache.js";
import type { Extractor, ExtractResult } from "../types.js";

const extractors: Extractor[] = [
  new HelpSfExtractor(),
  new DeveloperSfExtractor(),
];

const ALLOWED_HOSTS = ["help.salesforce.com", "developer.salesforce.com"];

export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export async function scrape(url: string): Promise<ExtractResult> {
  if (!isAllowedUrl(url)) {
    throw new Error(
      `URL not allowed. Only ${ALLOWED_HOSTS.join(" and ")} are supported.`
    );
  }

  // Check cache first
  const cached = getCached(url);
  if (cached) return cached;

  // Find the right extractor
  const extractor = extractors.find((e) => e.canHandle(url));
  if (!extractor) {
    throw new Error(`No extractor found for URL: ${url}`);
  }

  const result = await extractor.extract(url);

  // Cache the result
  setCache(result);

  return result;
}

export { analyzePage } from "./analyzer.js";
