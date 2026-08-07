# ZeroContext Roadmap & State Tracker

## 📌 Active Sprint Goal
Polish the ML redaction tokens. Currently, it redacts using abstract tokens like `[PER_211]`, `[LOC_234]`. We need semantic tokens like `[PERSON_<number>]` and `[CITY_<number>]` so AI retains contextual understanding of the entity type.

## 🏃‍♂️ In Progress (Current Focus)
- [ ] **Semantic Token Replacements:** Update `vault.ts` and `background.ts` to substitute ML outputs with readable tokens like `[PERSON_1]`, `[CITY_1]`, or `[COUNTRY_1]`. The `<number>` suffix must dynamically follow the existing vault schema indexing to ensure consistency.

## ✅ Completed 
- [x] **Phase 1 (Regex Vault):** Completed, tested, mathematically sound, and deduplicated.
- [x] **Lexer (`src/lexer.ts`):** AST Lexer properly ignores JSON keys/code syntax.
- [x] **Offscreen Pipeline Scaffolded:** Service Worker ⇄ Offscreen Document ⇄ Sandbox Iframe is fully race-condition safe. Data loss bug via `postMessage` structured clone and offscreen message routing resolved.
- [x] **Initialize Transformers.js (WASM in Sandbox):** The `Xenova/distilbert-base-multilingual-cased-ner-hrl` model is successfully running natively quantized. Fetch-delegation and WASM execution confirmed.

## 🔮 Backlog / Up Next
- [ ] Connect the Web Worker payload router to the background script.
- [ ] Content Script UI: Listen for DOM Paste events.
- [ ] Content Script UI: Listen for DOM Copy events (De-anonymization).
- [ ] Create UI Progress Badge ("Redacting PII... 80%") for massive payloads > 300ms.