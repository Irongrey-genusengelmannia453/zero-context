# ZeroContext: Master Architecture & Business Logic

## 1. Project Goal & Business Logic
**ZeroContext** is a lightweight, privacy-first, zero-latency Data Loss Prevention (DLP) Chrome Extension. 
* **The Problem:** Professionals accidentally paste sensitive client data (Personally Identifiable Information - PII) into web-based LLMs (ChatGPT, Claude, Gemini), creating massive compliance and data breach vulnerabilities.
* **The Solution:** A two-way proxy that intercepts paste/copy events on specific AI domains. It masks sensitive data locally before it enters the text box, and restores the original data when the user copies the LLM's response.
* **The Core Constraint:** **100% of processing must happen client-side (in-browser).** No data ever leaves the user's device. No cloud APIs, no external LLM calls, and scaling costs must remain at $0.

## 2. Tech Stack & Strict Constraints
* **Language:** TypeScript (Strict typing enforced).
* **Build Tool:** Vite + `@crxjs/vite-plugin` (Manifest V3 automation).
* **UI/View:** Vanilla HTML & DOM manipulation (strictly NO React, Vue, or complex state management).
* **Styling:** Pico.css (Classless CSS framework).
* **AI/ML:** Transformers.js (v3+) configured explicitly for **WebGPU acceleration** (`device: 'webgpu'`).
* **Testing:** Vitest.

## 3. The Redaction Engine (Zero-Trust Pipeline)
We operate on a strict Zero-Trust model. All text is assumed to contain PII until scanned. To achieve zero false-negatives while maintaining sub-50ms latency, we utilize a deterministic 3-Layer Architecture:

### Layer 1: Deterministic Engine & Gazetteers (0-5ms)
* **Targets:** Credit Cards (Luhn), SSNs, SINs, Emails, Phone Numbers, IPs, API Keys, and structured physical addresses.
* **Mechanism:** Synchronous Regex execution + Compressed Geo-Trie (Gazetteer) for fuzzy-matching global cities and states.
* **Execution:** Runs instantly in the Background Service Worker (`src/regexEngine.ts`).

### Layer 2: AST / Syntax Lexer (5ms)
* **Goal:** Prevent False Positives on code structure while capturing hidden PII in variables/comments.
* **Mechanism:** A lightweight custom lexer that separates structural code tokens (e.g., `function`, `class`, `{`, `}`) from User String Literals and Code Comments. 
* **Routing:** Structural code bypasses ML completely. Extracted string literals (e.g., `"user_address": "123 main st"`) are forwarded to Layer 3.

### Layer 3: WebGPU-Accelerated Neural Engine (15-30ms)
* **Targets:** Proper names, organizations, and unstructured addresses.
* **Engine:** Quantized Token Classification (NER) via Transformers.js using WebGPU. 
* **Mechanism:** Uses Subword (WordPiece) tokenization to natively catch typos (e.g., "jhon") and lowercase text without relying on fragile capitalization heuristics. All prose and all strings extracted from Layer 2 MUST pass through this layer.

## 4. Pipeline & Thread Isolation (Manifest V3)
Heavy ML matrix math will freeze the host webpage's UI if executed on the main thread. We utilize a strict **3-Tier Pipeline**:
1. **The Dispatcher (`background.ts`):** Listens to content scripts and manages the ephemeral Vault memory.
2. **The Bridge (`offscreen-manager.ts` & `offscreen.html`):** A hidden Offscreen Document created dynamically to access DOM/Worker APIs that standard Service Workers cannot access. Includes a race-condition-safe Promise lock and spin-down lifecycle hooks.
3. **The Engine (`worker.ts`):** An isolated Web Worker spawned by the Offscreen Document. This is where Transformers.js will live. Communication happens via strongly typed `taskId` mapping to handle asynchronous responses.

## 5. Ephemeral Memory (The Vault)
* **Mechanism:** Intercepted entities are mapped to safe tokens (e.g., `john@doe.com` -> `[EMAIL_1]`).
* **Storage:** Data is kept in an in-memory dictionary `TabVaultData`, separated strictly by `tabId`. It is backed up asynchronously to `chrome.storage.session`.
* **Security:** When a tab is closed or navigated away from an AI domain, the `tabId` vault is immediately flushed from memory.