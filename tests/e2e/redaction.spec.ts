import { test, expect } from './fixtures';
import path from 'path';

test.describe('ZeroContext Redaction E2E with Live Fallback', () => {
  
  test('should execute full paste/redact/copy pipeline simulating human interaction', async ({ page }) => {
    
    let activeSelector = '';
    let isMock = false;

    // --- STEP 1: Environment Selection with Fallback ---
    await test.step('Environment Discovery (ChatGPT -> Gemini -> Mock)', async () => {
      // 1. Try Live ChatGPT
      try {
        console.log('[E2E] Attempting live ChatGPT...');
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
        const chatgptSelector = '#prompt-textarea';
        await page.waitForSelector(chatgptSelector, { timeout: 4000 });
        activeSelector = chatgptSelector;
        console.log('[E2E] ChatGPT Live loaded successfully.');
      } catch (e) {
        console.log('[E2E] ChatGPT blocked or redirected (likely auth). Trying Gemini...');
        // 2. Try Live Gemini
        try {
          await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
          const geminiSelector = 'rich-textarea, div[contenteditable="true"]';
          await page.waitForSelector(geminiSelector, { timeout: 4000 });
          activeSelector = geminiSelector;
          console.log('[E2E] Gemini Live loaded successfully.');
        } catch (err) {
          console.log('[E2E] Gemini blocked. Falling back to local Mock HTML...');
          // 3. Fallback to Local Mock (Intercepting ChatGPT domain to trigger content script)
          isMock = true;
          activeSelector = '#prompt-textarea';
          
          await page.route('https://chatgpt.com/', async (route) => {
            await route.fulfill({
              path: path.join(process.cwd(), 'tests/e2e/mocks/chatgpt.html'),
              status: 200,
              contentType: 'text/html'
            });
          });
          
          await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
          await page.waitForSelector(activeSelector, { timeout: 2000 });
          console.log('[E2E] Local Mock loaded successfully.');
        }
      }
    });

    const textbox = page.locator(activeSelector).first();
    const sensitiveText = "Hello! My name is Michael Scott and I work at Dunder Mifflin in Scranton. Please contact me at michael@dundermifflin.com or call 555-123-4567.";

    // --- STEP 2: Human Interaction & Paste ---
    await test.step('Simulate human interaction and Paste', async () => {
      // Visual verification delays
      await page.waitForTimeout(1000); 

      // Simulate human mouse movement
      const box = await textbox.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
        await page.waitForTimeout(500);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await textbox.focus();
      }

      await page.waitForTimeout(500);

      // Write to real OS clipboard
      await page.evaluate((text) => navigator.clipboard.writeText(text), sensitiveText);
      
      // Simulate physical paste shortcut (Ctrl+V or Cmd+V)
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+V`);
      
      console.log(`[E2E] Human paste simulated. Payload size: ${sensitiveText.length} chars.`);
    });

    // --- STEP 3: Verify Redaction Pipeline (WASM NER + Regex) ---
    await test.step('Wait for pipeline and verify redaction', async () => {
      // The model download and inference might take 15-30s on first run.
      // We wait for the PERSON token which proves WASM execution succeeded.
      await expect(textbox).toContainText('PERSON', { timeout: 45000 });
      
      // Visual delay to allow user to see the redacted output
      await page.waitForTimeout(1500);

      const finalContent = await textbox.textContent() || '';
      console.log(`[E2E] Redacted Output: ${finalContent}`);
      
      // Assert Original Text is GONE
      expect(finalContent).not.toContain('Michael Scott');
      expect(finalContent).not.toContain('Dunder Mifflin');
      expect(finalContent).not.toContain('michael@dundermifflin.com');
      expect(finalContent).not.toContain('555-123-4567');

      // Assert ML (NER) Tokens are present
      expect(finalContent).toMatch(/PERSON\.[a-zA-Z0-9_]+/);
      expect(finalContent).toMatch(/ORGANIZATION\.[a-zA-Z0-9_]+/); // Dunder Mifflin
      
      // Assert Regex Tokens are present (Formatted safely for LLM)
      expect(finalContent).toMatch(/user\.[a-zA-Z0-9_]+@example\.com/); // Email
      expect(finalContent).toMatch(/\(000\) 000-\d{4}/); // Phone
    });

    // --- STEP 4: Verify Unredaction (Copy) ---
    await test.step('Simulate copy and verify unredaction', async () => {
      // Focus and Select All
      await textbox.focus();
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+A`);
      await page.waitForTimeout(500);

      // Clear clipboard to prove we actually get new text
      await page.evaluate(() => navigator.clipboard.writeText("CLEARED"));

      // Execute Copy
      await page.keyboard.press(`${modifier}+C`);
      
      // Visual delay
      await page.waitForTimeout(1000);

      // Read clipboard contents
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
      console.log(`[E2E] Clipboard after copy: ${clipboardContent}`);
      
      // Verify the background script successfully reversed the tokens
      expect(clipboardContent).toContain('Michael Scott');
      expect(clipboardContent).toContain('michael@dundermifflin.com');
      expect(clipboardContent).toContain('555-123-4567');
      expect(clipboardContent).toContain('Dunder Mifflin');
    });

  });
});
