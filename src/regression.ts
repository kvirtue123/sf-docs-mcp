import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scrape } from "./extractors/index.js";
import { closeBrowser } from "./extractors/base.js";

interface RegressionCase {
  id: string;
  description?: string;
  url: string;
  minMarkdownLength?: number;
  expectPageType?: string;
  expectError?: boolean;
}

interface RegressionFile {
  cases: RegressionCase[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGRESSION_PATH = join(__dirname, "..", "regression-urls.json");

function loadCases(): RegressionCase[] {
  const raw = readFileSync(REGRESSION_PATH, "utf8");
  const data = JSON.parse(raw) as RegressionFile;
  return data.cases;
}

async function main(): Promise<void> {
  const cases = loadCases();
  const failures: string[] = [];

  for (const c of cases) {
    try {
      if (c.expectError) {
        await scrape(c.url);
        failures.push(`${c.id}: expected scraper error, got success`);
      } else {
        const result = await scrape(c.url);
        if (
          c.minMarkdownLength != null &&
          result.markdown.length < c.minMarkdownLength
        ) {
          failures.push(
            `${c.id}: markdown length ${result.markdown.length} < ${c.minMarkdownLength}`
          );
        }
        if (
          c.expectPageType != null &&
          result.pageType !== c.expectPageType
        ) {
          failures.push(
            `${c.id}: pageType ${JSON.stringify(result.pageType)} !== ${JSON.stringify(c.expectPageType)}`
          );
        }
      }
    } catch (err) {
      if (!c.expectError) {
        failures.push(
          `${c.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (failures.length) {
    console.error("Regression failures:\n", failures.join("\n"));
    process.exit(1);
  }

  console.error(`Regression OK: ${cases.length} cases`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeBrowser());
