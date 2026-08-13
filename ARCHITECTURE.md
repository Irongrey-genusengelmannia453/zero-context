# ZeroContext: Master Architecture & Business Logic

## 1. Project Goal & Core Constraints
**ZeroContext** is a lightweight, privacy-first, zero-latency Data Loss Prevention (DLP) Chrome Extension. 
* **The Problem:** Professionals accidentally paste sensitive client data (PII) into web-based LLMs (ChatGPT, Claude, Gemini).
* **The Solution:** A two-way proxy that intercepts paste/copy events on specific AI domains. It masks sensitive data locally before it enters the text box, and restores the original data when the user copies the LLM's response.
* **The Constraint:** **100% of processing must happen client-side (in-browser).** No external LLM calls, zero cloud APIs, and $0 scaling costs.

## 2. Tech Stack & Rules
* **Language:** TypeScript (Strict typing enforced. `any` is banned. Zod for boundaries).
* **Build Tool:** Vite + `@crxjs/vite-plugin` (Manifest V3 automation).
* **UI/View:** Vanilla HTML & DOM manipulation (No React/Vue).
* **Styling:** Pico.css (Classless CSS framework).
* **AI/ML:** Transformers.js (v3+) strictly configured for **WASM inference** (`device: 'wasm'`).

## 3. The Redaction Engine (Zero-Trust Pipeline)
We operate on a 3-Layer Architecture to achieve zero false-negatives with sub-50ms latency:

### Layer 1: Deterministic Engine & Gazetteers (0-5ms)
* **Targets:** Credit Cards (Luhn), SSNs, Emails, Phones, IPs.
* **Execution:** Synchronous Regex execution in the Background Service Worker (`src/regexEngine.ts`).

### Layer 2: AST / Syntax Lexer (5ms)
* **Goal:** Prevent False Positives on code structure while capturing hidden PII.
* **Mechanism:** Separates structural code tokens from User String Literals and Code Comments. Structural code bypasses ML completely. Extracted string literals are forwarded to Layer 3.

### Layer 3: WASM Neural Engine (15-30ms)
* **Targets:** Proper names, organizations, unstructured addresses.
* **Engine:** Quantized Token Classification (NER) via `Transformers.js` (e.g., `Xenova/distilbert-base-multilingual-cased-ner-hrl` using `quantized: true`).

## 4. Pipeline & Thread Isolation (Manifest V3 Constraints)
Heavy ML matrix math will freeze the host webpage if executed on the main thread. We utilize a strict **3-Tier Pipeline**:
1. **The Dispatcher (`background.ts`):** Listens to content scripts and manages the ephemeral Vault memory.
2. **The Bridge (`offscreen-manager.ts` & `offscreen.ts`):** Hidden Offscreen Document accessing DOM/Worker APIs.
3. **The Sandbox (`sandbox.ts`):** An isolated iframe injected by the Offscreen Document to host Transformers.js.

## 5. Critical Technical Learnings & Hard Rules
* **The `blob:` Ban (WebGPU is impossible):** Chrome MV3 strictly enforces CSPs that ban `blob:` URLs in extension pages/workers. We MUST use a Sandboxed Iframe (which allows custom CSPs) to run WASM execution. We also strictly disable WebGPU probing (`env.backends.onnx.wasm.proxy = false`) to avoid crash-inducing `requestAdapter()` warnings.
* **Null-Origin Cache Delegation:** Sandbox pages run with a `null` origin, causing `SecurityError` if accessing `CacheStorage`. We must intercept `globalThis.fetch` in the Sandbox and delegate caching network requests via `postMessage` to the Offscreen Document, which transfers the `ArrayBuffer` back. This process requires a strict timeout (e.g., 120s) to prevent the Sandbox Promise from hanging infinitely.
* **Structured Clone Serialization Loss:** Custom class instances (like `Transformers.js` outputs) lose methods and properties when sent via `postMessage`. We must *explicitly map* model outputs to plain JSON-safe arrays before sending from the Sandbox to the Offscreen.
* **Background Response Routing:** When routing `postMessage` responses from the Sandbox through the Offscreen to the Background, we cannot use the `sendResponse()` callback inside `chrome.runtime.onMessage` because the Background is listening on a new channel. The Offscreen must initiate a *new* `chrome.runtime.sendMessage()` back to the Background script.
* **The CRXJS Sandbox Bug:** `@crxjs/vite-plugin` silently strips the `"sandbox"` CSP directive. We use a custom Vite plugin to manually inject the `"sandbox"` CSP into the built `dist/manifest.json`.
* **Ephemeral Vault:** Mapped entities (e.g., `user.684@example.com`, `PERSON.el64_1`) are stored in `TabVaultData` separated by `tabId`. They must be flushed immediately when the tab closes.

## 6. End-to-End (E2E) Testing Strategy
* **Framework:** Playwright is used to launch a real Chromium instance with the unpacked extension loaded from `dist`.
* **Environment:** Tests run against local mock HTML pages that perfectly replicate the structural DOM of ChatGPT and Claude (e.g., specific `contenteditable` configurations). We avoid live production domains to prevent flakiness from auth walls and A/B testing.
* **Pipeline Validation:** The E2E tests are full-stack. They trigger a real paste event, allow the actual WASM model to be downloaded (which caches on the first run) and executed in the Sandbox, and verify that the final DOM string has been redacted correctly.