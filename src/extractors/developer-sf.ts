import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { getStealthPage } from "./base.js";
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
      // domcontentloaded is more reliable than networkidle on dev docs pages
      // that keep long-polling analytics connections open.
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for Salesforce doc content components specifically — not bare
      // <main>, which exists as an empty shell before LWC hydration completes
      // and would cause Strategy 3 to fire too early and return nothing useful.
      await page
        .waitForSelector("doc-content-layout, doc-amf-reference", {
          timeout: 10000,
        })
        .catch(() => {
          /* neither component appeared — Strategy 3–5 fallback chain will run */
        });

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
            // Fallback: serialize shadow root children after stripping
            // <script> and <style> so the resulting Markdown isn't polluted
            // with component CSS and bootstrap code.
            const clone = docLayout.shadowRoot.cloneNode(true) as DocumentFragment;
            clone.querySelectorAll("script, style").forEach((n) => n.remove());
            const container = document.createElement("div");
            container.append(...Array.from(clone.childNodes));
            return {
              title: pageTitle,
              html: container.innerHTML,
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
