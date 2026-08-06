# ZeroContext Roadmap & State Tracker

## 📌 Active Sprint Goal
Scaffold the **Layer 2 AST Lexer** to safely extract strings from code, and connect the Sandbox AI pipeline to the main execution flow.

## 🏃‍♂️ In Progress (Current Focus)
- [ ] **Create the Lexer (`src/lexer.ts`):** Write `extractTextForML(input)` that detects Code/JSON and returns an array of only string literals/comments. Returns full string if standard prose.
- [ ] **Lexer TDD:** Create `src/lexer.test.ts`. Verify it ignores JSON keys/code syntax but extracts text values.

## ✅ Completed 
- [x] **Phase 1 (Regex Vault):** Completed, tested, mathematically sound, and deduplicated.
- [x] **Offscreen Pipeline Scaffolded:** Service Worker ⇄ Offscreen Document ⇄ Sandbox Iframe is fully race-condition safe.
- [x] **Initialize Transformers.js (WASM in Sandbox):** The `Xenova/bert-base-NER` model is loading in `src/sandbox/sandbox.ts` utilizing cache-delegation to the Offscreen document.

## 🔮 Backlog / Up Next
- [ ] Connect the Web Worker payload router to the background script.
- [ ] Content Script UI: Listen for DOM Paste events.
- [ ] Content Script UI: Listen for DOM Copy events (De-anonymization).
- [ ] Create UI Progress Badge ("Redacting PII... 80%") for massive payloads > 300ms.