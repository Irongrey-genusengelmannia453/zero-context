import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({ }, use) => {
    // Determine path to the unpacked extension
    const pathToExtension = path.join(process.cwd(), 'dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Chrome Extensions do not work in standard headless mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ],
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    
    // Fallback: wait for the service worker to become active
    let [background] = context.serviceWorkers();
    if (!background)
      background = await context.waitForEvent('serviceworker');

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // For manifest v3:
    let [background] = context.serviceWorkers();
    if (!background)
      background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});
export const expect = test.expect;
