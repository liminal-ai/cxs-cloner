# Team-Orchestrated Implementation — Learning Log

Continuation of `team-orchestrated-spec.md`. That log covered the spec creation phases: epic through tech design validation through story sharding, documenting what an orchestrator needs to know about managing the review, consolidation, and validation cycles. This log picks up at implementation — the part where validated stories become working code.

The spec log ended with Entry 21 (story sharding complete). The stories have been functionally sharded and technically enriched. All 8 stories (0-7) exist with full Architecture Context, TC-to-Test Mapping, and Technical Checklists. No code exists yet.

**Goal:** Document everything that happens during team-orchestrated implementation with enough depth and texture that a future skill can encode the patterns. The spec log's value came from the analytical entries — the ones that explained *why* things worked, what corrections the human made, what patterns emerged that weren't obvious in advance. This log needs the same resolution. Not status updates — learning material.

**Success criteria — what the human said explicitly:** The implementation itself is the vehicle, not the destination. A perfect implementation with thin notes is a failure. A messy implementation with thorough notes that support building a reproducible orchestration skill is a success. The priority is capturing enough information — decisions, mistakes, corrections, patterns, anti-patterns, timing, context management, handoff shape, verification patterns — that a skill can be built from this log. Speed and polish of the implementation are secondary to the richness of the documentation.

This means: when something goes wrong, that's learning material — document it thoroughly. When I make a bad decision, the correction is the signal. When the implementer hits a wall, the pattern of how I diagnose and recover is exactly what the skill needs. Optimize for learning surface area, not implementation velocity.

---

## Context

**Project:** cxs-cloner (Codex Session Cloner)
**Artifacts available:** Epic (validated), Tech Design (validated, 2085 lines), 8 technically enriched stories (Story 0-7), story index with coverage gate and integration path trace
**Code state at start:** Nothing. No src/, no package.json, no tests. Greenfield.
**Reference implementation:** `/Users/leemoore/code/agent-cli-tools/ccs-cloner/` — a production CLI solving the same problem for Claude Code sessions. Same tech stack, same patterns. The implementing agents can look at it for guidance.

**Implementation approach:** Sequential, story-by-story. The dependency chain is linear — each story builds on the previous. No parallelism attempted this run. The goal is to document the sequential pattern first; parallel story execution is a future optimization that needs the baseline pattern understood before it can be meaningfully attempted.

**Story 7 note:** The epic originally marked Story 7 (Compacted Session Calibration) as "may be deferred until sample data is available." The human overrode this — compacted Codex sessions likely already exist in `~/.codex/sessions/` from real usage. Finding and analyzing them can be part of the story's work, not a prerequisite. This is the kind of judgment call the orchestrator should learn to make: when a "deferred" tag is really "I don't have the data" vs "this genuinely can't be done yet," and whether the data can be obtained as part of the work rather than before it.

---

## Entries

### Entry 1 — What the orchestrator loaded before starting

Before spawning any agents, I read the full epic (625 lines), the full tech design (2085 lines in chunks), the full spec log (467 lines / 21 entries), and loaded the ls-impl skill. The ls-impl skill is the implementation methodology — it defines the TDD cycle (Skeleton → Red → Green → Self-Review → Gorilla → Verify), the commit checkpoint discipline, the verification scripts, and the rules about when to stop and ask vs when to push forward.

Reading the tech design was the most important preparation. The stories contain the what (ACs, TCs, interfaces), but the tech design contains the architecture context that ties everything together — module responsibilities, flow diagrams, the zone model, test strategy, fixture patterns. An orchestrator who only reads the stories would miss the cross-cutting patterns that inform good implementation decisions.

The spec log was valuable for calibrating my own behavior. The key lessons from the spec phase that carry forward into implementation:
- Handle routine decisions autonomously, escalate only genuine ambiguity (Entry 11)
- Do the research before asking the human (Entry 11 — the bun:test vs vitest example)
- Proportional effort — not every artifact needs the same level of verification (Entry 21)
- The human decides when to stop validation loops, not the orchestrator (Entry 17)
- Context management across teammates is a real concern (Entry 15)

The stories are in sequence: 0 (foundation), 1 (session discovery + list), 2 (parser + info), 3 (turn boundaries), 4 (record stripping), 5 (clone pipeline), 6 (config + polish), 7 (compacted calibration). Linear dependency chain — each builds on the previous.

### Entry 2 — Choosing how to spawn implementers

The first real decision: what kind of agent to use and how to configure it.

I chose `liminal-spec:senior-engineer` as the subagent type. This is a custom agent type defined in the project's skill configuration that has access to all tools (Read, Write, Edit, Bash, Glob, Grep) and is specifically designed for TDD methodology with quality gate enforcement. The alternative was `general-purpose`, which also has all tools but doesn't carry the TDD-specific framing. The senior-engineer type should pattern-match on the TDD cycle described in the story more naturally.

Whether this choice matters in practice is something I'll be watching for. If the senior-engineer agent doesn't naturally follow the TDD phases or misses the Red/Green discipline, the agent type isn't actually providing the value I expected, and a general-purpose agent with better prompting might be equivalent. This is an open observation, not a conclusion.

Permission mode: `bypassPermissions`. The implementing agent needs to create dozens of files, run `bun install`, execute build tools, run test suites, and format code. Each of those operations would normally trigger a permission prompt. In a team implementation context where the agent is working in a controlled project directory on well-defined tasks, prompting on every file write is overhead that doesn't add safety value. The orchestrator has already reviewed the story and understands what the agent should be creating. The real safety boundary is the orchestrator's review of the output, not per-operation permissions.

### Entry 3 — Story 0 handoff: what goes in the prompt vs what the agent reads

Story 0 is the foundation story — no TDD cycle, pure infrastructure. The story file contains everything: exact type definitions (copy-paste ready from the tech design), error class signatures, SessionBuilder API, static fixture specifications, and a complete file layout.

The handoff prompt I wrote included:
- The path to the story file and instruction to read it (the primary artifact)
- The path to the reference implementation (ccs-cloner) for config patterns
- The path to the tech design for ambiguity resolution
- An explicit summary of what to create (7 categories)
- Explicit exit criteria (the verification commands)
- Specific gotchas I noticed while reading the story: call_id pairing in SessionBuilder, turn_context records at turn boundaries, error class naming conventions

The question of what goes in the prompt vs what the agent discovers by reading is interesting. The story file IS the specification — it has everything. In theory, I could just say "read story-0.md and implement it." But I chose to include a structured summary and the gotchas because:

1. The story is 498 lines. A summary helps the agent plan before diving in.
2. The gotchas are things I noticed as potential trip-up points from reading the story against my understanding of the tech design. The agent reading the story cold might miss the significance of call_id pairing rules because they're mentioned once in passing, but they're critical for the SessionBuilder to be useful to later stories.
3. Pointing at the reference implementation (ccs-cloner) gives the agent a working example of the config patterns, which the story describes in abstract terms.

Whether this level of handoff detail is the right amount, too much, or too little — I'll learn from the result. If the agent ignores my gotchas and hits those exact problems, the handoff needs more emphasis. If the agent handles everything cleanly and my gotchas were unnecessary, the stories are good enough to stand alone.

**What I didn't include in the prompt:** The ls-impl skill content. Story 0 explicitly says "no TDD cycle" — it's infrastructure. The full TDD methodology matters for Stories 1-6, not here. For the next story, I'll need to decide whether to include TDD phase instructions in the prompt or let the agent discover the methodology from the story's technical sections.

**Fresh agent per story vs persistent agent:** Starting with fresh agents per story. The reasoning: each story is a self-contained unit of work with its own scope, interfaces, and tests. A fresh agent reads the story cold and implements it without carrying assumptions from previous stories. The downside is losing context continuity — things the Story 0 implementer learns about the codebase structure would need to be re-discovered by the Story 1 implementer. For now, I'm betting that the stories are good enough specifications that re-discovery is cheap. If this turns out to be wrong — if later story implementers keep hitting the same problems because they don't know what earlier implementers learned — then persistent agents or better inter-story context handoff becomes important.
