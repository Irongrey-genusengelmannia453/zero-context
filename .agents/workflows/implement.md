---
name: implement
description: "Implement a piece of work based on the ROADMAP.md spec."
---

Implement the work described by the user in the `ROADMAP.md` Active Sprint Goal.

1. Use `/tdd` where possible, at pre-agreed seams.
2. Follow all typescript and architecture rules outlined in `AGENTS.md`.
3. Run typechecking (`tsc --noEmit`) regularly, single test files regularly, and the full test suite once at the end.
4. Once done, use `/code-review` to review the work against the local standards.
5. Commit your work to the current local branch with a semantic commit message and check the item off in `ROADMAP.md`.