import { scrape, analyzePage, isAllowedUrl } from "./extractors/index.js";
import { closeBrowser } from "./extractors/base.js";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: node dist/test-url.js <url> [--analyze]");
    process.exit(1);
  }

  const analyze = process.argv.includes("--analyze");

  if (!isAllowedUrl(url)) {
    console.error(
      "Error: Only help.salesforce.com and developer.salesforce.com URLs are supported."
    );
    process.exit(1);
  }

  try {
    if (analyze) {
      console.log(`Analyzing: ${url}\n`);
      const result = await analyzePage(url);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Scraping: ${url}\n`);
      const result = await scrape(url);

      console.log(`Title: ${result.title}`);
      console.log(`Page Type: ${result.pageType}`);
      console.log(`Cached: ${result.cached}`);
      console.log(`Extracted At: ${result.extractedAt}`);
      console.log(`Content Length: ${result.markdown.length} chars`);
      console.log(`\n--- Markdown Preview (first 2000 chars) ---\n`);
      console.log(result.markdown.slice(0, 2000));

      if (result.markdown.length > 2000) {
        console.log(`\n... (${result.markdown.length - 2000} more chars)`);
      }
    }
  } catch (err) {
    console.error(
      "Error:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
