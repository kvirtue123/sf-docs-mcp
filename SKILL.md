# SF Docs MCP Skill

## When to use `scrape_sf_docs`
Use this tool whenever you need to read Salesforce documentation content. Pass any `help.salesforce.com` or `developer.salesforce.com` URL.

### Success indicators
- **help.salesforce.com**: `pageType: "help-article"` means the Aura API returned real content
- **developer.salesforce.com**: `pageType: "guide"` or `pageType: "reference"` means the Playwright extractor found substantive content

### Failure recovery
If an article returns empty or error content:
1. The fwuid self-healing mechanism in `help-sf.ts` should handle stale tokens automatically
2. If articles consistently return empty after a Salesforce release (~Feb, Jun, Oct), the `KNOWN_FWUID` constant in `src/extractors/help-sf.ts` can be manually updated as a fallback
3. For `developer.salesforce.com` pages that return empty content, use `analyze_page_structure` to inspect the DOM

## When to use `analyze_page_structure`
Only use this for `developer.salesforce.com` pages where `scrape_sf_docs` returns empty or incomplete content. It inspects the DOM and reports:
- Custom elements present on the page
- Shadow DOM elements
- Suggested CSS selector or shadow path to extract content

This information helps diagnose why content extraction failed and suggests a path forward.
