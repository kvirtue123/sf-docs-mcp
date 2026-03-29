import { getStealthPage } from "./base.js";
import type { AnalyzeResult } from "../types.js";

/**
 * Launches a stealth Playwright browser, inspects the DOM of a
 * developer.salesforce.com page, and returns structural information
 * to help debug empty content issues.
 */
export async function analyzePage(url: string): Promise<AnalyzeResult> {
  const page = await getStealthPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const customElements: string[] = [];
      const shadowDomElements: string[] = [];
      let suggestedSelector: string | null = null;
      let suggestedShadowPath: string[] | null = null;

      // Find all custom elements (tags with hyphens)
      const allElements = document.querySelectorAll("*");
      const seen = new Set<string>();
      for (const el of allElements) {
        const tag = el.tagName.toLowerCase();
        if (tag.includes("-") && !seen.has(tag)) {
          seen.add(tag);
          customElements.push(tag);
          if (el.shadowRoot) {
            shadowDomElements.push(tag);
          }
        }
      }

      // Try to find the main content container
      const candidates = [
        "doc-content-layout [slot='content']",
        "doc-amf-reference .markdown-content",
        "doc-content-layout",
        "main",
        "[role='main']",
        ".content-body",
        ".doc-content",
      ];

      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 100) {
          suggestedSelector = sel;
          break;
        }
      }

      // Try shadow DOM traversal
      if (!suggestedSelector) {
        for (const tag of shadowDomElements) {
          const host = document.querySelector(tag);
          if (host?.shadowRoot) {
            const inner = host.shadowRoot.querySelector(
              "slot, .content, main, article"
            );
            if (inner && inner.textContent && inner.textContent.trim().length > 100) {
              suggestedShadowPath = [tag, inner.tagName.toLowerCase()];
              break;
            }
          }
        }
      }

      return {
        customElements,
        shadowDomElements,
        suggestedSelector,
        suggestedShadowPath,
        pageTitle: document.title || "",
        bodyText: document.body.textContent?.slice(0, 500) || "",
      };
    });

    return { url, ...result };
  } finally {
    await page.close();
  }
}
