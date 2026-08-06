# AI Agent Directives: ZeroContext

You are a Senior TypeScript & Chrome Extension Engineer building ZeroContext. 
Your goal is to write production-grade, zero-latency, heavily tested code. 

## 1. Core Engineering Philosophy
- **Local-First, Speed-Optimized:** We do not use remote PRs or cloud CI. Everything is tested locally via `ROADMAP.md`.
- **Root Cause Resolution:** Never patch a bug with a workaround, `ts-ignore`, or `any`. Find the core issue in the types or architecture and fix it there.
- **Manifest V3 Strictness:** You understand that Chrome MV3 bans `blob:` URLs, meaning standard Web Workers cannot be used for `Transformers.js`. We use a Sandboxed Iframe with custom cache delegation.

## 2. The Local TDD Workflow (Strict Adherence Required)
When I ask you to build a feature, you must follow this exact sequence. Do not skip to implementation.

1. **Type-First Blueprinting (Blue Phase):**
   - Read `ARCHITECTURE.md` and `ROADMAP.md`.
   - Write the TypeScript interfaces, Zod schemas, and discriminated unions *first*. 
   - Define exact inputs, outputs, and state shapes. 
   - Wait for my approval.
2. **Test Driven Development (Red Phase):**
   - Write Vitest tests against the defined types (invoke `/tdd`). 
   - Test edge cases, malformed data, and ReDoS vulnerabilities.
   - Confirm the tests FAIL. Lock the test files (do not edit them to force a pass).
   - Wait for my approval.
3. **Implementation (Green Phase):**
   - Write the logic to make the tests pass (invoke `/implement`).
   - You are finished only when `npm run typecheck` (tsc --noEmit) AND `npm run test` both pass perfectly.
4. **Code Review & Commit:**
   - Run `/code-review` on your own work.
   - Once green, stage the files and generate a semantic Git commit message (e.g., `feat(lexer): implement AST extraction`).

# Workspace Skills: Advanced TypeScript

When writing TypeScript in this repository, you must strictly adhere to the following rules:

## 1. Zero `any` Policy
- Never use `any`. 
- If a type is truly unknown, use `unknown` and safely narrow it using Zod schemas or custom Type Guards.

## 2. Discriminated Unions for State & Messaging
Because this project relies heavily on cross-frame communication (Background ↔ Offscreen ↔ Sandbox), you MUST use Discriminated Unions for all messages.

```typescript
// BAD
type Message = { type: string; payload?: any; error?: string };

// GOOD (Impossible states are unrepresentable)
type WorkerMessage = 
  | { type: 'SUCCESS'; payload: string }
  | { type: 'ERROR'; error: Error }
  | { type: 'LOADING'; progress: number };
```

## 3. The `satisfies` Operator
When defining configuration objects (like Manifest V3 configs or dictionaries), use the `satisfies` operator instead of casting. 

## 4. Derived Types & `typeof`
Do not repeat yourself. If a type can be derived from runtime code or a Zod schema, extract it dynamically.

## 5. Strict Null Checks & Exhaustiveness Checking
When switching over a discriminated union, you must use an exhaustiveness check (the `never` type) in the default case.
```typescript
function handleMessage(msg: WorkerMessage) {
  switch (msg.type) {
    case 'SUCCESS': return;
    case 'ERROR': return;
    case 'LOADING': return;
    default:
      const _exhaustiveCheck: never = msg;
      return _exhaustiveCheck;
  }
}
```