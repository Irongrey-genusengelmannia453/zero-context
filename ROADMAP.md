# ZeroContext Roadmap & State Tracker

## 📌 Active Sprint Goal
Polish the ML redaction tokens. Currently, it redacts using abstract tokens like `[PER_211]`, `[LOC_234]`. We need semantic tokens like `[PERSON_<number>]` and `[LOCATION_<number>]` so AI retains contextual understanding of the entity type.

## 🏃‍♂️ In Progress (Current Focus)
*(None)*

## ✅ Completed 
- [x] **Redaction Pipeline Integration:** Implemented AI Domain gatekeeper in `content.ts` to prevent over-redaction on non-AI domains, and fixed variable-length tab ID token overlap.
- [x] **Content Script UI:** Listen for DOM Paste events.
- [x] **Content Script UI:** Listen for DOM Copy events & `navigator.clipboard` Monkey Patching (De-anonymization).
- [x] **Connect the Web Worker payload router to the background script.**
- [x] **Universal Alias Algorithm:** Sub-token routing (`PERSON.181.1`) and Ambiguity Preservation (`PERSON.183`) implemented to maintain perfect coreference resolution and case-preservation without poisoning LLM context.
- [x] **Semantic Token Replacements:** Update `vault.ts` and `background.ts` to map ML entity groups to semantic Dot-notation tokens (`PERSON.123`).
- [x] **Phase 1 (Regex Vault):** Completed, tested, mathematically sound, and deduplicated.
- [x] **Lexer (`src/lexer.ts`):** AST Lexer properly ignores JSON keys/code syntax.
- [x] **Offscreen Pipeline Scaffolded:** Service Worker ⇄ Offscreen Document ⇄ Sandbox Iframe is fully race-condition safe. Data loss bug via `postMessage` structured clone and offscreen message routing resolved.
- [x] **Initialize Transformers.js (WASM in Sandbox):** The `Xenova/distilbert-base-multilingual-cased-ner-hrl` model is successfully running natively quantized. Fetch-delegation and WASM execution confirmed.

## 🔮 Backlog / Up Next
- [x] Create UI Progress Badge ("Redacting PII... 80%") for massive payloads > 300ms.