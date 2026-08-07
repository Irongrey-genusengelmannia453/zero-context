# ZeroContext: AI Engineering Workflow Guide

This document is your daily cheat sheet for driving the AI agent. Do not skip steps. This strict Test-Driven Development (TDD) loop guarantees zero-latency, production-quality code.

## 🧭 The Command Cheat Sheet
When you need the AI to do something, use these specific commands:

| Situation / Goal | Command to Run | What it does |
| :--- | :--- | :--- |
| **Start a new feature** | `/grill-with-docs` | Interviews you, scopes the feature, updates `ROADMAP.md`. |
| **Write the Tests (Red)** | `/tdd` | Writes Vitest test files against pre-agreed seams. Locks them. |
| **Write the Code (Green)**| `/implement` | Writes the implementation logic until tests pass. |
| **Check the Quality** | `/code-review` | Spawns two agents to check for code smells and spec alignment. |
| **Fix a Hard Bug** | `/diagnosing-bugs` | Drops into a strict 6-phase loop to isolate the failure. |
| **Design a deep module** | `/codebase-design` | Helps you map out clean TypeScript interfaces and architectural seams. |

---

## 🔄 The Daily Loop (Copy-Paste Prompts)

Follow this sequence exactly for every new feature or fix. You are the Tech Lead; the AI is your Senior Developer.

### Step 1: Feature Selection & Planning
*Let the AI tell you what's next based on your roadmap.*
> **Prompt:** "Read `ROADMAP.md`. What is the next logical task we should tackle in the Active Sprint? Once we agree, let's run `/grill-with-docs` to define the exact scope and update the roadmap."

### Step 2: Type-First Blueprinting (Blue Phase)
*Lock in the data structures before any logic is written.*
> **Prompt:** "Let's start blueprinting. Write the TypeScript interfaces, Zod schemas, and types for this feature. Follow the strict rules in `AGENTS.md` (no `any`, use discriminated unions). Do not write implementation logic yet."

### Step 3: Write Failing Tests (Red Phase)
*Prove the test actually checks something.*
> **Prompt:** "Run `/tdd`. Write the Vitest tests for the interfaces we just defined. Make sure you test the edge cases. Do not write the implementation logic yet. I will run these locally to ensure they fail."
> *(Action: You run `npm run test` to verify failure).*

### Step 4: Implementation (Green Phase)
*Write the code to make it pass.*
> **Prompt:** "Run `/implement`. Write the minimal code required to make these tests pass. Adhere strictly to the `ARCHITECTURE.md` constraints."
> *(Action: You run `npm run test` and `npm run typecheck` (`tsc --noEmit`). Iterate until 100% green).*

### Step 5: Code Review & Check-Off
*Verify standards and commit.*
> **Prompt:** "Run `/code-review` on the code you just wrote against `AGENTS.md` and `ROADMAP.md`. If it passes, format the code, write a semantic commit message for me to use, and check this task off as 'Completed' in `ROADMAP.md`."

---

## 🐛 Exception Flow: Handling Bugs
If tests fail unexpectedly, or you hit a weird Manifest V3 sandbox error, DO NOT just say "Fix this error." Force the AI into a structured diagnostic loop.

> **Prompt:** "We have a bug. Run `/diagnosing-bugs`. The symptom is [Describe the error or paste the log]. Help me build a tight feedback loop (Phase 1) so we can isolate this."

## 🏗️ Exception Flow: Architectural Pivots
If you realize you need a new library, or you need to change how the Extension Pipeline communicates, update the master blueprint first.

> **Prompt:** "I want to change our architecture. We are switching [Old Tech/Rule] to [New Tech/Rule] because [Reason]. Update `ARCHITECTURE.md` to reflect this change before we write any new code."