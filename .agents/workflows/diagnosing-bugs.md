---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.
When exploring the codebase, read `ARCHITECTURE.md` to get a clear mental model of the relevant modules and constraints (e.g., Manifest V3 CSPs).

## Phase 1 — Build a feedback loop
**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug, you will find the cause.

### Ways to construct one — try them in roughly this order
1. **Failing test** at whatever seam reaches the bug (Vitest).
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout.
4. **Headless browser script** (Puppeteer) — drives the UI.
5. **Throwaway harness.** Spin up a minimal subset of the system.
6. **Property / fuzz loop.** 1000 random inputs looking for failure mode.
7. **Bisection harness.** `git bisect run`.

### Tighten the loop
Once you have *a* loop, **tighten** it: Can I make it faster? Can I make the signal sharper? Can I make it more deterministic?

### Completion criterion — a tight loop that goes red
Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** that you have **already run at least once** (show the invocation and its output), and that is Red-capable, Deterministic, and Fast.

## Phase 2 — Reproduce + minimise
Run the loop. Watch it go red — the bug appears.
Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**. Done when **every remaining element is load-bearing**.

## Phase 3 — Hypothesise
Generate **3–5 ranked hypotheses** before testing any of them. Each hypothesis must be **falsifiable**: state the prediction it makes.
> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

**Show the ranked list to the user before testing.** ## Phase 4 — Instrument
Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**
**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Untagged logs survive; tagged logs die.

## Phase 5 — Fix + regression test
Write the regression test **before the fix** — but only if there is a **correct seam** for it.
1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.

## Phase 6 — Cleanup + post-mortem
- [ ] Original repro no longer reproduces.
- [ ] Regression test passes.
- [ ] All `[DEBUG-...]` instrumentation removed.
- [ ] The hypothesis that turned out correct is stated in the commit message.

**Ask: what would have prevented this bug?** If the answer involves architectural change, update `ARCHITECTURE.md` or `ROADMAP.md` with the findings.