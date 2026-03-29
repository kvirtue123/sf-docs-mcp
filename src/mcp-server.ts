import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scrape, analyzePage, isAllowedUrl } from "./extractors/index.js";
import { closeBrowser } from "./extractors/base.js";

const pkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json"
);
const packageVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version as string;

const server = new McpServer({
  name: "sf-docs",
  version: packageVersion,
});

server.tool(
  "scrape_sf_docs",
  "Fetch a Salesforce documentation page and return it as clean Markdown. Supports help.salesforce.com (Aura API, no browser) and developer.salesforce.com (Playwright). Results are cached for 24 hours.",
  {
    url: z
      .string()
      .url()
      .describe(
        "Full URL of a Salesforce documentation page (help.salesforce.com or developer.salesforce.com)"
      ),
  },
  async ({ url }) => {
    if (!isAllowedUrl(url)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Only help.salesforce.com and developer.salesforce.com URLs are supported.",
          },
        ],
      };
    }

    try {
      const result = await scrape(url);
      const header = [
        `# ${result.title}`,
        "",
        `**Source:** ${result.url}`,
        `**Type:** ${result.pageType}`,
        `**Cached:** ${result.cached}`,
        `**Extracted:** ${result.extractedAt}`,
        "",
        "---",
        "",
      ].join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: header + result.markdown,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error scraping ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "analyze_page_structure",
  "Inspect the DOM structure of a developer.salesforce.com page. Use this when scrape_sf_docs returns empty content, to discover custom elements, shadow DOM, and suggest selectors.",
  {
    url: z
      .string()
      .url()
      .describe("Full URL of a developer.salesforce.com page to analyze"),
  },
  async ({ url }) => {
    try {
      const u = new URL(url);
      if (u.hostname !== "developer.salesforce.com") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: analyze_page_structure only works with developer.salesforce.com URLs.",
            },
          ],
        };
      }

      const result = await analyzePage(url);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error analyzing ${url}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const mode = process.argv[2];

  if (mode === "serve") {
    // HTTP SSE mode
    const { SSEServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/sse.js"
    );
    const http = await import("node:http");

    const PORT = parseInt(process.env.PORT || "3000", 10);
    let sseTransport: InstanceType<typeof SSEServerTransport> | null = null;

    const httpServer = http.createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/sse") {
        sseTransport = new SSEServerTransport("/messages", res);
        await server.connect(sseTransport);
      } else if (req.method === "POST" && req.url === "/messages") {
        if (sseTransport) {
          await sseTransport.handlePostMessage(req, res);
        } else {
          res.writeHead(400);
          res.end("No SSE connection established");
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    httpServer.listen(PORT, () => {
      console.error(`sf-docs MCP server listening on http://localhost:${PORT}`);
    });
  } else {
    // Default: stdio mode
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("sf-docs MCP server running on stdio");
  }

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await closeBrowser();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
