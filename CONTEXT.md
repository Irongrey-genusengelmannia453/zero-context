# Current Sprint Context

## Current State
* **Phase 1 (Regex Vault):** Completed, tested, and deduplicated.
* **Offscreen Pipeline:** The pipeline (Service Worker ⇄ Offscreen Document ⇄ Sandbox Iframe) is fully scaffolded and race-condition safe. We transitioned from Web Workers to a Sandboxed Iframe architecture to bypass Chrome MV3's strict CSP (which blocks `blob:` URLs required by `@huggingface/transformers` underlying ONNX runtime).
* **Architecture Pivot:** We have abandoned the "Skip-If-Clean" heuristic. We are implementing a 3-Layer Zero-Trust architecture featuring an AST Lexer and WASM-based AI inference. (WebGPU was abandoned because its multithreading heavily relies on CSP-violating `blob:` worker spawns, forcing us to use single-threaded WASM).

## Active Sprint Goal
Scaffold the Layer 2 AST Lexer to safely extract strings from code, and connect the Sandbox AI pipeline to the main execution flow.

## Immediate Next Steps (For the AI)
1. **Initialize Transformers.js (WASM in Sandbox):** *Done.* The `Xenova/bert-base-NER` model is now loading via `@huggingface/transformers` in `src/sandbox/sandbox.ts` using cache-delegation back to the Offscreen document.
2. **Create the Lexer:** Create a new file `src/lexer.ts`. Write a lightweight function `extractTextForML(input: string)` that detects if the input is Code/JSON. If it is, it should return an array of only the string literals and comments. If it is standard prose, it returns the whole string. 
3. **Write Lexer Tests:** Create `src/lexer.test.ts` to verify that `extractTextForML` correctly ignores JSON keys/code syntax but extracts the actual text values.

*Note for AI:* Do not connect the Web Worker to the UI or background script yet. Just initialize the WebGPU model in the worker and build the standalone Lexer utility.