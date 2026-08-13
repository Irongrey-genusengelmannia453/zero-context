# ZeroContext Roadmap & State Tracker

## 📌 Active Sprint Goal
*(None — previous sprint completed. See Completed section below.)*

## 🏃‍♂️ In Progress (Current Focus)
- [ ] **User Onboarding Flow:** Implement a `chrome.runtime.onInstalled` listener to open a Welcome/Onboarding page that explains how the zero-latency, local-first proxy works.
- [ ] **Release Automation:** Create a build script (`npm run build:zip`) for Chrome Web Store packaging that strips dev dependencies, handles sourcemaps appropriately, and ensures manifest compliance.

## ✅ Completed 
- [x] **Dynamic Domain Gatekeeper (Data Layer):** Implemented `chrome.storage.sync` Domain Configuration state with Zod schemas, discriminated unions, and a synchronous `DomainGatekeeper` class for zero-latency URL checking. Updated `manifest.json` to properly declare the Big 5 default domains and the `scripting` permission, strictly avoiding `<all_urls>`.
- [x] **Playwright E2E Testing Framework:** Built a full-pipeline Playwright E2E testing framework that validates the 3-tier pipeline (DOM Paste -> Background -> Offscreen -> Sandbox WASM -> DOM Update). Integrates Live-site fallbacks (ChatGPT -> Gemini -> Mock) and simulates human interactions to avoid bot detection while testing Regex and NER redaction + copy unredaction.
- [x] **Redaction Pipeline Integration:** Implemented AI Domain gatekeeper in `content.ts` to prevent over-redaction on non-AI domains, and fixed variable-length tab ID token overlap.
- [x] **Content Script UI:** Listen for DOM Paste events.
- [x] **Content Script UI:** Listen for DOM Copy events & `navigator.clipboard` Monkey Patching (De-anonymization).
- [x] **Connect the Web Worker payload router to the background script.**
- [x] **Universal Alias Algorithm:** Sub-token routing (`PERSON.el64_1_2`) and Ambiguity Preservation (`PERSON.el64_3`) implemented to maintain perfect coreference resolution and case-preservation without poisoning LLM context.
- [x] **Semantic Token Replacements:** Update `vault.ts` and `background.ts` to map ML entity groups to semantic Dot-notation tokens (`PERSON.el64_1`).
- [x] **Phase 1 (Regex Vault):** Completed, tested, mathematically sound, and deduplicated.
- [x] **Lexer (`src/lexer.ts`):** AST Lexer properly ignores JSON keys/code syntax.
- [x] **Offscreen Pipeline Scaffolded:** Service Worker ⇄ Offscreen Document ⇄ Sandbox Iframe is fully race-condition safe. Data loss bug via `postMessage` structured clone and offscreen message routing resolved.
- [x] **Initialize Transformers.js (WASM in Sandbox):** The `Xenova/distilbert-base-multilingual-cased-ner-hrl` model is successfully running natively quantized. Fetch-delegation and WASM execution confirmed.

## 🔮 Backlog / Up Next (V1.0 Production Readiness)
- [x] **Extension Branding & Assets:** Generate and integrate missing 16x16, 32x32, 48x48, and 128x128 icons into `manifest.json` and the repository.
- [ ] **Dynamic Domain Gatekeeper:** Refactor `manifest.json` to support dynamic domain injection (or use `<all_urls>`) and update the existing Domain Gatekeeper in `content.ts` to respect user-configured custom AI domains, strictly adhering to *Rule 6* in `AGENTS.md`.
- [ ] **User Onboarding Flow:** Implement a `chrome.runtime.onInstalled` listener to open a Welcome/Onboarding page that explains how the zero-latency, local-first proxy works.
- [x] **E2E Testing Integration:** Add Playwright/Puppeteer E2E browser tests to validate paste/copy hijacking against actual (or mocked) ChatGPT/Claude DOM interfaces to ensure UI resilience.
- [x] **Graceful Degradation & Network Recovery:** Implement fallback strategies (falling back to Layer 1 Regex-only) if the WebAssembly Model fails to download or initialize in the Sandbox.
- [ ] **Release Automation:** Create a build script (`npm run build:zip`) for Chrome Web Store packaging that strips dev dependencies, handles sourcemaps appropriately, and ensures manifest compliance.