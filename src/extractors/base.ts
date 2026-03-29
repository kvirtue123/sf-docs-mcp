import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { BrowserContext, Page } from "playwright";

// Apply stealth plugin once
chromium.use(StealthPlugin());

let browserInstance: Awaited<ReturnType<typeof chromium.launch>> | null = null;

export async function getStealthBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
    });
  }
  return browserInstance;
}

export async function getStealthPage() {
  const browser = await getStealthBrowser();
  const page = await browser.newPage();
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}
