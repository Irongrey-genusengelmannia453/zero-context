# ZeroContext Memory & Brain 🧠

This document serves as the permanent memory bank for the ZeroContext project. It dictates the coding style, engineering philosophy, and critical architectural learnings that must be applied to all future work.

## 1. Engineering Philosophy & Rules
- **Senior-Level Solutions Only:** No quick fixes, band-aids, or hacky workarounds. We diagnose and eliminate the *root cause* of an error rather than masking it.
- **Efficiency & Zero-Latency:** This is a local Data Loss Prevention (DLP) tool. Performance is paramount. Code must be heavily optimized to ensure minimal latency (sub-50ms execution) and zero UI blocking. 
- **Testing on Every Step:** New features and bug fixes must be accompanied by extensive, edge-case-driven testing (Vitest). Test the boundaries, overlaps, malformed inputs, and ReDoS vulnerabilities.
- **Strict TypeScript:** Enforce rigorous type safety. Do not use `any` or cast blindly without type-narrowing (e.g., using discriminator fields like `action === 'SANDBOX_READY'`).
- **Codebase Alignment:** Always adhere to the established styling, architecture, and patterns of the current codebase. Do not introduce arbitrary new libraries or paradigms unless absolutely necessary and discussed.

## 2. Project Architecture & Pipeline
ZeroContext operates on a **3-Layer Zero-Trust Pipeline**:
1. **Dispatcher (Background):** Synchronous Regex + Gazetteer execution (Luhn validation, SSNs, Emails, Phones).
2. **AST Lexer:** Lightweight utility to extract string literals from Code/JSON and discard structural code, preventing false positives on syntax.
3. **WASM Neural Engine (Sandbox):** Quantized NER via `Transformers.js` to catch unstructured PII (names, organizations) that Regex misses.

## 3. Critical Technical Learnings & Solutions

### Manifest V3 Restrictions & ML (The `blob:` ban)
- **The Problem:** Chrome Manifest V3 strictly enforces Content Security Policies (CSP) that ban `blob:` URLs in extension pages and Web Workers. `@huggingface/transformers` uses `blob:` URLs to spawn ONNX runtime threads (meaning WebGPU multithreading is impossible in MV3).
- **The Solution (Sandbox Iframe):** We run the ML pipeline inside a Sandboxed Iframe. Sandboxed pages can be granted a custom CSP in `manifest.json` that explicitly whitelists `blob:`, allowing WASM execution.

### The CRXJS Sandbox Bug
- **The Problem:** `@crxjs/vite-plugin` has a known bug where it silently strips the `"sandbox"` CSP directive from `manifest.json` during build.
- **The Solution:** We utilize a custom Vite plugin in `vite.config.ts` (using the `closeBundle` hook and raw `fs.writeFileSync`) to manually inject the `"sandbox"` CSP directly into the built `dist/manifest.json` after CRXJS finishes.

### Null-Origin Cache Delegation
- **The Problem:** Because Sandbox pages run with a `null` origin, they trigger a `SecurityError` if they attempt to access the browser's `CacheStorage`. If the Sandbox cannot cache, the user must download the 20MB ML model every time the extension boots.
- **The Solution (Fetch Proxy):** We intercept network requests inside the Sandbox by redefining `globalThis.fetch`. The interceptor delegates the actual HTTP fetch over `postMessage` to the parent Offscreen Document (which has full Cache API access). The Offscreen Document checks the cache, downloads if necessary, and returns the raw `ArrayBuffer` back to the Sandbox with zero-copy overhead.

---
*Note to AI:* Review this document before making architectural changes or debugging complex cross-frame messaging errors. Update it continuously as new lessons are learned.
