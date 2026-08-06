---
name: code-review
description: Review the changes since a fixed point along two axes — Standards (does the code follow AGENTS.md?) and Spec (does the code match what the ROADMAP.md asked for?). Runs both reviews in parallel sub-agents and reports them side by side. 
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to `AGENTS.md` and `ARCHITECTURE.md`?
- **Spec** — does the code faithfully implement the `ROADMAP.md` sprint goal?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

## Process

### 1. Pin the fixed point
Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~1`, etc. If they didn't specify one, ask for it. Capture the diff command once: `git diff <fixed-point>...HEAD`.

### 2. Identify the spec source
Look for the originating spec, in this order:
1. The **Active Sprint Goal** in `ROADMAP.md`.
2. A path the user passed as an argument.
3. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources
Anything in the repo that documents how code should be written (`AGENTS.md`, `ARCHITECTURE.md`).

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3). 
- **The repo overrides.** A documented repo standard always wins.
- **Always a judgement call.** Each smell is a labelled heuristic, never a hard violation.

Each smell reads *what it is* → *how to fix*:
- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it.
- **Duplicated Code** — the same logic shape appears in more than one hunk. → extract the shared shape.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together. → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt**:
- The full diff command and commit list.
- The list of standards-source files you found (`AGENTS.md`, `ARCHITECTURE.md`), **plus the smell baseline from step 3**.
- The brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard; and (b) any baseline smell you spot: name it and quote the hunk. Under 400 words."

**Spec sub-agent prompt**:
- The diff command and commit list.
- The path or fetched contents of the `ROADMAP.md` spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Under 400 words."

### 5. Aggregate
Present the two reports under `## Standards` and `## Spec` headings, verbatim. Do **not** merge or rerank findings. End with a one-line summary: total findings per axis, and the worst issue within each axis.