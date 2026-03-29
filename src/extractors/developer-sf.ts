import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { getStealthPage, closeBrowser } from "./base.js";
import type { Extractor, ExtractResult } from "../types.js";

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  td.use(gfm);
  return td;
}

/**
 * Detect the page type from the URL path.
 * e.g. /docs/einstein/genai/guide/get-started.html → "guide"
 *      /docs/atlas.en-us.apexref.meta/apexref/... → "reference"
 */
function detectPageType(url: string): string {
  const u = new URL(url);
  const p = u.pathname;
  if (p.includes("/guide/")) return "guide";
  if (p.includes("/reference/") || p.includes("ref.meta")) return "reference";
  if (p.includes("/overview/")) return "overview";
  return "developer-article";
}

export class DeveloperSfExtractor implements Extractor {
  canHandle(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname === "developer.salesforce.com";
    } catch {
      return false;
    }
  }

  async extract(url: string): Promise<ExtractResult> {
    const page = await getStealthPage();

    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait a bit for any client-side rendering
      await page.waitForTimeout(2000);

      // Fallback chain to extract content
      const { title, html } = await page.evaluate(() => {
        const pageTitle =
          document.title || document.querySelector("h1")?.textContent || "";

        // Strategy 1: doc-content-layout slot
        let content = document.querySelector(
          "doc-content-layout [slot='content']"
        );

        // Strategy 2: doc-amf-reference .markdown-content
        if (!content || !content.innerHTML.trim()) {
          content = document.querySelector(
            "doc-amf-reference .markdown-content"
          );
        }

        // Strategy 3: main element
        if (!content || !content.innerHTML.trim()) {
          content = document.querySelector("main");
        }

        // Strategy 4: Try shadow DOM traversal
        if (!content || !content.innerHTML.trim()) {
          const docLayout = document.querySelector("doc-content-layout");
          if (docLayout?.shadowRoot) {
            const slot = docLayout.shadowRoot.querySelector("slot[name='content']");
            if (slot) {
              const assigned = (slot as HTMLSlotElement).assignedElements();
              if (assigned.length > 0) {
                return {
                  title: pageTitle,
                  html: assigned.map((el) => el.innerHTML).join("\n"),
                };
              }
            }
            // fallback: entire shadow root
            return {
              title: pageTitle,
              html: docLayout.shadowRoot.innerHTML,
            };
          }
        }

        // Strategy 5: full body text dump
        if (!content || !content.innerHTML.trim()) {
          return {
            title: pageTitle,
            html: document.body.innerHTML,
          };
        }

        return {
          title: pageTitle,
          html: content.innerHTML,
        };
      });

      const td = createTurndown();
      const markdown = td.turndown(html).trim();
      const pageType = detectPageType(url);

      return {
        title: title.trim(),
        markdown,
        url,
        pageType,
        cached: false,
        extractedAt: new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }
}
