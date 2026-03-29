/** Result returned by any extractor */
export interface ExtractResult {
  title: string;
  markdown: string;
  url: string;
  pageType: string;
  cached: boolean;
  extractedAt: string;
}

/** Row stored in the SQLite cache */
export interface CacheEntry {
  url: string;
  title: string;
  markdown: string;
  pageType: string;
  extractedAt: string;
  expiresAt: number;
}

/** Common interface every extractor implements */
export interface Extractor {
  canHandle(url: string): boolean;
  extract(url: string): Promise<ExtractResult>;
}

/** Result from the DOM analyzer */
export interface AnalyzeResult {
  url: string;
  customElements: string[];
  shadowDomElements: string[];
  suggestedSelector: string | null;
  suggestedShadowPath: string[] | null;
  pageTitle: string;
  bodyText: string;
}
