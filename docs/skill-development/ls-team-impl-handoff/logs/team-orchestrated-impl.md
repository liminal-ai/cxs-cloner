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

### Entry 4 — The verification pattern for implementation (human-directed)

Before the Story 0 implementer came back, I started laying out my instinct for how verification should work — spot-checking types against the tech design, re-running verification commands, reading the SessionBuilder. The human stopped me: "don't just fly off and assume your instinct for verification will beat my experience." Fair correction. I asked how they verify instead.

The verification pattern the human described is structurally the same as the spec validation pattern documented in spec log Entry 7, adapted for implementation instead of document review. The core insight from the spec phase carries forward: the author is the best consolidator because they have the deepest context on what they built and why. Here's the flow:

**Step 1 — Implementer self-review.** The agent who did the implementation does a critical self-review of their own work. This is the same pattern as the author self-review in spec validation — implementing and reviewing activate different cognitive modes in the model. The agent who just built something, when asked to critically review it, will notice things they didn't notice while building. This isn't busywork — the spec log documented that self-review consistently catches real issues.

**Step 2 — Fresh Opus teammate review.** A separate Opus agent is spawned as a teammate. They receive the epic, the tech design, and the specific story being implemented. They read the code cold and do a full critical review. This is the independent perspective — they don't have the implementer's assumptions about "why I did it this way," so they catch things the implementer is blind to. Same principle as the fresh Opus reviewer in spec validation.

**Step 3 — Codex subagent review.** A Codex CLI instance is launched (via the codex-subagent skill) with the same artifacts — epic, tech design, story. Codex brings a different disposition: pedantic, literal, detail-oriented. In the spec phase, Codex caught things like miscounted test totals, missing AC references in module matrices, and TC assignment gaps. For implementation, this translates to: did the types match the tech design exactly, are all TCs covered by tests, are the verification scripts correct, did the SessionBuilder actually implement the full API from the story. The model difference IS the disposition difference — no need to prompt Codex to "be pedantic."

**Step 4 — Consolidation back to implementer.** This is the key step. The implementer receives all the feedback from both reviewers — the Opus teammate's review and the Codex review. They're asked to: verify every claim against the actual code, assess what's real vs what's a misread, produce a full assessment with recommendations for what needs fixing. The implementer is the right consolidator because they know the code. A reviewer might say "the SessionBuilder doesn't handle custom_tool_call pairs" — the implementer can check in 5 seconds whether that's true. A separate consolidation agent would need to re-read the code.

**Step 5 — Pushback loop.** If the implementer disagrees with a finding — not just reclassifying severity, but substantively pushes back — they provide their reasoning to the orchestrator (me). I route the pushback back to whichever reviewer raised the finding. This is the same dynamic as the spec phase: severity reclassification is filtered out (the orchestrator ignores it), but substantive disagreement is worth exploring. If a fresh Codex still insists on the finding after seeing the pushback, it's probably real. If the fresh Codex drops it or accepts the reasoning, the finding was marginal.

**What the orchestrator does during verification:**
- Keeps the implementer session alive through the entire cycle (they're the consolidator and the fixer)
- Fires the Opus teammate and the Codex subagent (these can run in parallel — they're independent reviews)
- Routes reviews back to the implementer at the right time
- After consolidation, prompts the "what else did you notice but not report" question (spec log Entry 10 — this consistently surfaces hidden items)
- Assesses the final list: handle routine fixes autonomously (tell the implementer to fix them), escalate only genuine judgment calls to the human
- After fixes, runs a re-verification round (fresh Codex) to confirm
- Decides when the loop terminates: either clean or nitpicks-only = done

**How this differs from my initial instinct — and the correction to the correction:** I initially proposed that the orchestrator personally spot-checks types, re-runs commands, reads the SessionBuilder. The human corrected me: don't assume your instinct beats my experience, ask instead. So I asked, and the human described the multi-perspective review pattern above. I then overcorrected — I wrote "the actual pattern is orchestrator orchestrates verification by others, not line-by-line code review." The human corrected again: "ultimately you need to verify as well."

So the orchestrator's verification is additive, not replaced. The three-reviewer pattern is the primary verification system. But the orchestrator also does their own pass on the final result. The orchestrator's pass is different in character from the reviewers' — it's a systems-level confirmation. Do the verification commands actually pass when I run them? Does the file structure match what the story specified? Did the fix cycle introduce new issues? Is the overall result coherent? The reviewers dig into the code; the orchestrator confirms the whole thing holds together.

This layering makes sense. The reviewers are detail-oriented — they're reading code against specs and catching mismatches. The orchestrator is process-oriented — they're confirming the output of the review-consolidation-fix cycle is actually clean. These are complementary, not redundant. A reviewer might say "the types look good" and the orchestrator runs `bun run typecheck` and it fails because of a missing import. Different failure modes caught by different verification layers.

**The orchestrator as tiebreaker and final authority.** The human added another dimension: when there's disagreement between reviewers and the implementer that the consolidation step doesn't resolve, it's the orchestrator's job to investigate and make the call. Not just route the pushback — actually dive into the code, acquaint yourself with the relevant facts, understand the issue from first principles, and provide arbitration. The orchestrator isn't a passive router of information between agents. They're an active participant in the verification who can read code, check claims, and make substantive engineering judgments.

The escalation threshold is calibrated: if the orchestrator understands the issue and is confident in the call, they make it. If it's a significant judgment call and the orchestrator isn't sure what's going on — maybe it touches architectural decisions, or the right answer depends on context the orchestrator doesn't have — then it goes to the human. The human is the final authority, but the orchestrator should resolve everything they can before escalating.

This completes the verification picture:
1. **Three reviews** (self, Opus, Codex) surface findings
2. **Implementer consolidation** verifies claims, produces assessment
3. **Pushback loop** for substantive disagreements
4. **Orchestrator fixes routing** — handles routine items autonomously
5. **Orchestrator verification** — runs commands, confirms coherence
6. **Orchestrator arbitration** — dives into disputed issues, makes calls
7. **Human escalation** — only for things the orchestrator genuinely can't resolve
8. **Re-verification** (fresh Codex) after fixes
9. **Loop termination** — clean or nitpicks-only = done

### Entry 5 — Story 0 implementer reports done, verification cycle begins

The implementer (story-0-impl-2) reported completion. Summary of what they delivered:
- 15 source files + 4 config files
- 11 smoke tests passing (31 expect calls)
- All verification gates clean (format, lint, typecheck)
- One deviation noted: removed an unused import of `ResponseItemPayload` in clone-operation-types.ts to satisfy `noUnusedLocals`

**Orchestrator's first action: confirm the agent's self-report.** Before launching the review cycle, I ran `bun run red-verify` and `bun test` myself. Both passed, confirming the agent's report is accurate. This is the "orchestrator verification" layer — cheap, fast, and establishes trust calibration. If these had failed, I'd know the agent's self-report can't be trusted and would need to dig deeper before launching reviewers (no point reviewing code that doesn't compile).

**Launching the three reviews in parallel.** All three fired simultaneously:

1. **Implementer self-review** — sent as a message to the existing implementer session. The prompt was specific about what to check: types vs tech design, error classes, SessionBuilder completeness, static fixtures, project config, and a catch-all "what concerns you." The key phrase: "Be honest and thorough. This review will be cross-referenced with external reviews." This isn't just politeness — it signals that false confidence will be caught by other reviewers, which pushes the model toward honest self-assessment.

2. **Fresh Opus teammate** (story-0-reviewer) — spawned as a new teammate on the same team. Given paths to the story, tech design, and epic. Prompt instructs them to read every source file and compare against the tech design's Low Altitude section. Organized output by severity. This is the independent perspective that catches what the implementer is blind to.

3. **Codex subagent** — launched via `codex exec` in the background with `--skip-git-repo-check` (the repo was just initialized, not sure if it's fully set up for Codex's git checks) and `-s read-only` (review only, no changes). Same artifact paths. The prompt emphasizes exhaustiveness: "report every deviation you find, no matter how small." The model difference provides the disposition difference — Codex will catch literal mismatches that Opus might wave off as "close enough."

**Decisions made in the launch:**

The Opus reviewer was spawned as `senior-engineer` subagent type rather than `general-purpose` or `Explore`. Senior-engineer has all the tools needed to read code, and the TDD-oriented framing should help it evaluate the SessionBuilder's test-readiness. Whether this matters vs general-purpose is still an open question — I'm being consistent with the implementer's agent type for now.

The Codex subagent was given `read-only` sandbox mode since it's only reviewing, not modifying anything. This is a safety boundary — the reviewer shouldn't be changing code. `model_reasoning_effort=high` because this is a detailed review task, not a quick check.

**What happens next:** When all three come back, I'll route the Opus and Codex reviews to the implementer for consolidation. The implementer will verify each claim against the code, produce an assessment, and recommend fixes. If there's pushback, I'll route it back to the relevant reviewer. Then I'll assess the final list, handle routine fixes autonomously, and escalate anything significant to the human.

### Entry 6 — Three reviews in: the cross-reference pattern

All three reviews came back. Here's what happened and what it reveals about the verification pattern.

**The convergence pattern.** Both external reviewers (Opus and Codex) independently found the same core issue: the error classes file (`clone-operation-errors.ts`) has message formats that deviate from the tech design across all 9 error classes. Every other file — types, constants, builder, fixtures, config — was verified clean by all reviewers. This convergence is the signal. When independent reviewers land on the same thing, it's real. When they diverge, it's worth investigating but might be noise.

**What the self-review missed.** The implementer's self-review did NOT catch the error message deviations. They reported "Error classes: Match. Signatures match story spec." But the messages don't match — they used simplified formats instead of the exact formats from the tech design. The self-review caught two things the external reviewers didn't (the `callIdCounter` smell and the missing SessionBuilder methods for ghost_snapshot/compaction), but missed the primary issue. This is exactly why multi-perspective review exists — the author's blind spots are different from a fresh reader's blind spots.

**Severity disagreements between reviewers.** The Opus reviewer rated all error message issues as Major (5 findings). Codex split them differently: the type contract changes (candidates optional, operation union) were Major, but the message format differences were Minor. This mirrors the spec log pattern — severity labels are noise, substance is signal. The orchestrator should focus on "does this need fixing" (yes, all of them) not "is it Major or Minor."

One interesting divergence: Codex rated the missing path aliases as Major while Opus rated it Minor. Looking at the story, it says "path aliases" in a list of tsconfig requirements, but the tech design doesn't specify what aliases to define. I need to make a call on this — it's ambiguous. My read: the story mentions it but the tech design has no aliases in its tsconfig definition. Since we're using relative imports throughout and the ccs-cloner reference implementation doesn't use path aliases either, this is a non-issue. I'll tell the implementer to skip it unless the human disagrees.

**The compacted fixture gap.** Only Codex caught that `compacted-session.jsonl` has no `replacement_history` field. The tech design mentions replacement_history as an edge case fixture target. This is a real gap but not blocking for Story 0 — it becomes relevant in Story 4 (record stripping) when compaction handling is tested. I'll flag it for the implementer to add.

**What the orchestrator does with this information.** Before the human told me the verification pattern, I was planning to spot-check the types myself. Instead, I fired three independent reviews that all converged on the same thing. The cross-reference makes the diagnosis obvious and high-confidence — I don't need to personally verify the error message formats because two independent reviewers verified them against the same spec references. My value-add is the cross-reference itself and the routing decisions: what's real, what's noise, what needs fixing, what gets punted.

I sent the full set of findings to the implementer for consolidation. This is the step where the implementer — who has the deepest context on the code — verifies each claim, proposes fixes, and pushes back on anything they disagree with. The implementer is the right person to do this because they can check a claim against the code in seconds. A separate consolidation agent would need to re-read everything.

**The "what else" question.** I included "Anything else you noticed while re-reading that nobody caught?" in the consolidation prompt. This is the implementation version of the "what else did you not report" technique from spec log Entry 10. The implementer, now reading their code with the external feedback fresh in mind, may notice things they filtered out during the initial implementation and the self-review.

### Entry 7 — Implementer went idle without applying fixes (a failure mode to encode)

After the consolidation step, the implementer produced an excellent assessment — verified all claims, categorized correctly, provided clear fix descriptions, pushed back on two items with good reasoning. Then I told them to proceed with the 9 fixes. They went idle without sending a completion message.

I checked the error classes file — unchanged. The fixes weren't applied. The implementer received the "proceed" message but either didn't process it or hit a context/turn issue.

This is a failure mode the skill needs to handle: **an agent goes idle after receiving instructions without executing them.** The orchestrator's response: check the actual state (read the file), confirm the work wasn't done, resend the instructions with more explicit detail. The second time I listed every fix with exact before/after values instead of referring to the consolidated assessment. More verbose, but leaves no ambiguity about what to do.

**Why this might have happened:** The teammate message system delivers messages to idle agents, waking them up. But the agent might process the message and go idle again without actually doing the work — maybe the turn limit was hit, maybe the message was processed as "acknowledged" rather than "execute." This is a reliability concern for the orchestration pattern. The orchestrator can't assume a message was acted on just because it was delivered — they need to verify the outcome.

**Pattern for the skill:** After sending fix instructions to a teammate, set an expectation for a completion report. If the teammate goes idle without reporting, check the actual state of the files. If unchanged, resend with explicit detail. Don't assume delivery equals execution.

**Update (corrected):** The implementer wasn't actually stalled — they were still working through the multi-file edit when I checked. The idle notification I saw was a transient signal during their processing, not a "I'm done and waiting" signal. The human caught this: "sometimes when he's in the middle of doing a bunch of stuff he is slow to respond." The pattern for the skill is more nuanced than "check after idle": idle notifications during a multi-step task are noise, not signal. Give the teammate reasonable time to complete before checking. The threshold is tricky — too patient and you waste time, too impatient and you interrupt work in progress.

### Entry 8 — Sequencing error: launched re-verification before implementer confirmed

After I independently verified the error classes file was fixed (read it, ran `bun run verify`), I launched the Codex re-verification immediately — without waiting for the implementer to send their completion report. The human caught this: "you launched codex before the implementor was done with his fixes."

I got lucky — the fixes were on disk, the file was correct, and Codex re-verified against the right state. But the process was wrong. The implementer is the one who knows when their work is complete. They might have more changes in flight. They might have fixed the error classes but not yet updated the fixture. By launching re-verification before the implementer signals "done," I risk Codex reviewing an incomplete state.

**The correct sequence:**
1. Send fix instructions to implementer
2. Wait for implementer to report "fixes applied, verify passes"
3. Orchestrator confirms (run verify, spot-check)
4. THEN launch Codex re-verification

The orchestrator's independent file reading is a confirmation step, not a trigger for the next phase. The teammate's report is the trigger.

**On status visibility:** The orchestrator can see idle notifications and can read files, but cannot see whether a teammate is mid-turn actively working. This creates an observation gap. The idle notification is particularly misleading — it fires when the agent's turn ends, but a teammate doing a multi-file edit may have multiple turns with idle notifications between them. The skill needs to encode: "wait for the explicit completion message, not just the absence of activity."

### Entry 9 — Story 0 complete: the full cycle in retrospect

Codex re-verification came back **READY**. Zero findings across all source and test files. Story 0 is verified and done.

**The full Story 0 timeline:**
1. Orchestrator reads story, prepares handoff prompt
2. Implementer spawned, builds everything from scratch
3. Implementer reports done: 15 source files, 4 config files, 11 smoke tests, all gates pass
4. Orchestrator confirms gates pass independently
5. Three reviews launched in parallel: self-review, Opus reviewer, Codex subagent
6. Self-review: honest, caught callIdCounter smell and missing builder methods, missed error class issues
7. Opus reviewer: found 5 Major (error message formats) + 5 Minor
8. Codex: found 3 Major + 9 Minor (same error class issues, different severity labels)
9. All reviews routed to implementer for consolidation
10. Implementer verified all claims, confirmed 8 real fixes, pushed back on 2 (both correctly)
11. Orchestrator assessed pushbacks (both valid), sent fix instructions
12. Implementer applied 9 fixes (8 error classes + 1 fixture)
13. Orchestrator confirmed fixes (verify passes, file reads correct)
14. Codex re-verification: READY, zero findings
15. Story 0 complete

**What the three-review pattern caught that single review would have missed:** The self-review caught the callIdCounter smell and missing builder methods (things only the author would notice). The external reviewers caught the error message deviations (things the author was blind to because they wrote the simplified versions deliberately). No single reviewer found everything. The cross-reference was the valuable artifact — it made the diagnosis obvious and high-confidence.

**What the orchestrator did right:**
- Confirmed the agent's self-report before launching reviews (cheap trust calibration)
- Fired all three reviews in parallel (time-efficient)
- Cross-referenced findings before routing to implementer (added value, not just forwarded)
- Assessed pushbacks autonomously (both correct, no human escalation needed)
- Did not escalate anything to the human (nothing warranted it)

**What the orchestrator did wrong:**
- Assumed teammate was stalled based on idle notification (premature; they were working)
- Launched Codex re-verification before implementer confirmed completion (got lucky but process was wrong)
- First fix message was too abstract ("proceed with fixes"); second was explicit with exact values (worked better)

**Metrics for the skill:**
- Implementation time (implementer): ~15 minutes for initial build
- Review cycle: ~10 minutes for all three reviews in parallel
- Consolidation + fixes: ~5 minutes
- Re-verification: ~3 minutes
- Total Story 0 wall time: ~35 minutes
- Findings: 8 real fixes (all in one file), 2 valid pushbacks, 1 enhancement
- Human escalations: 0

**Key insight for the skill:** Story 0 is pure infrastructure — no TDD cycle, no business logic, just types and config. Even so, the three-review pattern found 8 issues that would have propagated to later stories (error message formats are tested in Stories 2 and 5). The cost of the review cycle (~10 minutes) is small relative to the cost of discovering these issues in Story 5 when tests fail against wrong error messages. The verification pattern pays for itself even on "simple" stories.

### Entry 10 — Story 1 handoff: first real TDD story

Story 1 (Session Discovery and List Command) is the first story with the full TDD cycle — skeleton, red, green, verify. Story 0 was infrastructure; this one has real IO (filesystem scanning, JSONL parsing), real CLI wiring (citty commands), and 13+ tests.

**What changed in the handoff prompt compared to Story 0:** The Story 0 handoff was focused on "build these files." The Story 1 handoff explicitly instructs: read all three documents (story, tech design, epic), understand existing code from Story 0, plan in plan mode, then execute the TDD cycle. The plan step is important here because this is a multi-module story with dependencies between modules (scanner → reader → list-command). The implementer needs to think about build order, test fixture strategy, and how the modules integrate before writing code.

I also included the self-review instruction upfront in the handoff rather than sending it as a separate message after completion. Lesson from Story 0: the self-review prompt was a separate message and could have been missed or deprioritized. Making it part of the initial instructions means it's built into the implementer's mental model of "what done means."

**The tech design reading instruction:** I told the implementer to read the full tech design, not just the story. For Story 0 this was less important — types are self-contained. For Story 1, the tech design has detailed module responsibilities, flow diagrams, filename conventions, and malformed JSON handling strategies that the story references but doesn't fully reproduce. The story is supposed to be sufficient for implementation, but the tech design provides rationale that helps the implementer make better judgment calls at the margins.

**What I'm watching for:** This is the first story with filesystem tests. The implementer needs to create temp directories, write JSONL files to them, run the scanner/reader against them, then clean up. This is service-mock-level testing — real filesystem operations, no mocking of internal modules. If the implementer starts mocking the filesystem instead of creating real temp dirs, that's a red flag — the testing philosophy says mock only at external boundaries, and for a CLI tool, the filesystem IS the thing you're testing against. Temp dirs are in-process enough to be fast and deterministic.

**Story 1 has a CLI entry point change:** The existing `cli.ts` is a stub that throws NotImplementedError. This story replaces it with real arg parsing and command routing. That's a structural change worth checking — if the wiring is wrong, no subsequent story's CLI path works.

### Entry 11 — Context limits as an operational failure mode

The Story 1 implementer hit a context ceiling during the consolidation step. They had been spawned at the default 200k context. By the time they received the consolidation message, they had consumed: the full epic (~2000 lines), the full tech design (~2100 lines), the full story (~290 lines), the existing Story 0 codebase, their own implementation (6 source files + 2 test files), a deep self-review, and now two full external reviews to cross-reference. That's easily 200k+ tokens.

The symptom was an idle notification that looked like the transient ones from earlier — but this time the agent was actually stuck, not mid-turn. The human caught it from the tmux pane ("looks like it was about to run out of context") and increased the context to 1M.

**Pattern for the skill:** Stories that require reading the full epic + tech design + story, implementing multiple modules, doing a self-review, AND then processing external review consolidation can exceed 200k context. The skill should either:
1. Spawn implementers with higher context from the start (1M for implementation agents that will do the full read-implement-review cycle)
2. Or split the cycle: one agent implements, a different fresh agent consolidates reviews (since the consolidation step just needs the code on disk + the review findings, not the full spec context)

Option 1 is simpler. Option 2 is more context-efficient but adds orchestration complexity. For now, spawning at higher context is the pragmatic choice.

**The diagnostic challenge:** An agent hitting context limits looks identical to a transient idle notification. The orchestrator can't distinguish "agent is processing slowly" from "agent is stuck at context ceiling" from the idle signal alone. The human had visibility into the tmux pane that the orchestrator doesn't have. This is a blind spot in the orchestration model — the orchestrator should perhaps set a timeout expectation: if no response after N minutes on a consolidation request, investigate whether the agent is stuck rather than just waiting.

### Entry 12 — Story 1 complete: the first full TDD cycle

Codex re-verification returned 3 minors, all assessed as nits (non-empty line counting, TC-1.4.1 set equality pedantry, cwd display mode). None warranted sending back to the implementer. Story 1 is done.

**The full Story 1 verification cycle:**
1. Implementer reports done: 6 source files, 2 test files, 13 tests, all gates pass
2. Orchestrator confirms gates (24 tests, 70→58 expects at that point)
3. Three reviews fired in parallel: self-review request, Opus reviewer, Codex subagent
4. Self-review came back first: caught 2 test weaknesses (TC-1.3.1, TC-1.4.1), fixed them proactively (58→70 expects)
5. Opus reviewer: 2 actionable majors (full-file read, symlinks), 7 minors
6. Codex: 4 majors (regex permissiveness, full-file read, missing command stubs, TC-1.4.1), 4 minors
7. Consolidation sent to implementer with both external reviews
8. Implementer hit context ceiling at 200k — human intervened to increase to 1M
9. Implementer consolidated: 2 new fixes (streaming read, command stubs), 2 already fixed (from self-review), 4 valid pushbacks, 5 reasonable deferrals
10. Orchestrator assessed all pushbacks (all valid), confirmed fixes, ran Codex re-verification
11. Codex re-verify: 3 nits only → Story 1 done

**What the verification caught that mattered:**
- Missing info/clone stubs in main-command (Codex) — would have confused Story 2's implementer
- Full-file read instead of streaming (both reviewers) — performance contract violation that compounds on large session lists
- Two test weaknesses (self-review, Codex) — tests that could pass with broken implementations

**What was correctly pushed back:**
- Symlink directory handling (Opus) — empirically wrong, Bun's readdir does follow them
- Regex permissiveness (Codex) — intentional design, discovery vs validation separation
- citty limit type (both) — framework limitation, standard workaround
- JSON Date serialization (Opus) — standard behavior, non-issue

**The self-review catching issues before external reviews:** The implementer fixed TC-1.3.1 and TC-1.4.1 before the external reviews arrived. Both Codex and the self-review independently identified the same problems. This means the self-review step has real value even when external reviews are coming — it reduces the consolidation workload and gets fixes done faster. The skill should keep the self-review as a mandatory first step, not skip it just because external reviews are in flight.

**Story 1 vs Story 0 comparison:**
- Story 0: 8 fixes needed (all in one file, all message format deviations)
- Story 1: 4 fixes needed (2 from self-review, 2 from external), 4 valid pushbacks
- Story 1 had better initial quality on spec compliance but missed structural completeness (command stubs) and performance contract (streaming read)
- The pattern of "error classes deviate from spec" from Story 0 did not repeat — the implementer internalized that lesson

### Entry 13 — Process evolution: dual-verify with fix-capable reviewer for large stories

After Story 1's context ceiling issue during consolidation, the human suggested a streamlined verification process for larger stories. The insight: the three-review pattern (self + Opus + Codex) worked for Story 0 (small, infrastructure) but the consolidation step stresses the implementer's context on larger stories. By the time they receive two full external reviews, they've already consumed most of their context on the epic + tech design + story + implementation + their own tests.

**The evolved process for large stories:**
1. Implementer reports done → orchestrator confirms gates
2. Fresh Opus reviewer + Codex fired in parallel (no self-review request to the implementer)
3. Orchestrator cross-references Opus and Codex findings
4. Agreed fixes go to the fresh Opus reviewer to implement (not back to the implementer)
5. Codex re-verify if needed
6. Implementer is shut down after step 1 — their job is done

**Why this works better for large stories:**
- The fresh Opus reviewer starts with full context budget — they can read the entire spec suite AND the implementation AND apply fixes without hitting limits
- The implementer doesn't need to process external reviews (which was the step that caused the context ceiling in Story 1)
- The Opus reviewer who found the issues is the one who fixes them — they already understand the problems deeply
- Eliminates the consolidation back-and-forth entirely

**Why the original three-review pattern still makes sense for small stories:**
- Small stories (Story 0) don't stress context limits
- The self-review catches things the implementer is uniquely positioned to notice (like the callIdCounter smell)
- The consolidation step with pushbacks is valuable when the implementer has the capacity for it

**The skill should encode both patterns:** Three-review for small/medium stories, dual-verify with fix-capable reviewer for large stories. The threshold is roughly: if the story has 15+ tests and the implementer had to read the full tech design, use the streamlined pattern.

**A subtlety the human flagged:** "that will implement any fixes you and gpt 53 codex decide needs to be made." The orchestrator and Codex form the judgment layer — the Opus reviewer is the hands. This is different from the Story 0/1 pattern where the implementer was both the consolidator AND the fixer. Here, the orchestrator does the consolidation (cross-references Opus and Codex), makes the call on what's real, and routes the fixes to the reviewer who has clean context.

### Entry 14 — Story 2: dual-verify in practice + calibration patterns

Story 2 was the first story using the streamlined dual-verify process. Observations:

**The process ran cleanly.** No context ceiling issues, no idle-notification confusion, no lost messages. The implementer was shut down immediately after confirming gates. The Opus reviewer and Codex ran in parallel. The orchestrator cross-referenced, decided on 3 fixes, routed them to the reviewer, and the reviewer applied them in one pass. Total fix cycle: one round, no back-and-forth. This is significantly smoother than Story 1's three-review + consolidation + context-ceiling + resend pattern.

**Codex and Opus have different severity calibration.** Codex flagged "TC-3.1.4 doesn't assert debug log emission" and "TC-3.3.3 doesn't assert warning log" as Major. Opus flagged the same observations as Minor (m-4) with the explicit reasoning: "testing debug log output would require mocking consola, which goes against the no-mocks principle." The orchestrator sided with Opus — asserting console output requires mocking an internal boundary, which the testing philosophy explicitly prohibits. The code emits the logs (verified by inspection), and the behavioral outcome (records preserved, bad lines skipped) IS tested.

**Pattern for the skill:** Codex tends to flag any gap between spec text and test assertions as a Major, regardless of whether closing the gap would violate other principles. The orchestrator needs to apply judgment about whether a finding is "spec gap" (fix) or "acceptable tradeoff between competing principles" (skip). When the testing philosophy says "don't mock internal boundaries" and a TC says "with a debug log," the answer is: verify the log by code inspection, test the observable behavior. Not every spec word needs a corresponding assertion.

**Forward-looking fixes are valuable.** Two of the three fixes (SessionStatistics type location, builder call_id) weren't Story 2 bugs — they were structural issues that would cause friction in Stories 3-5. Fixing them now, while the reviewer has the context and the code is fresh, is cheaper than discovering them during Story 4 when the implementer is trying to write pairing tests and the builder doesn't emit call_id on local_shell_call. The skill should encourage reviewers to flag forward-looking issues AND the orchestrator should fix them proactively rather than deferring everything that "doesn't affect the current story."

**The reviewer-as-fixer pattern.** Sending fix instructions to the reviewer who found the issues works well because: (a) they've already read the full spec suite and the implementation, (b) they understand the problems they found, (c) they have fresh context budget since they only reviewed, didn't implement 19 tests worth of code. The risk is that the reviewer introduces their own bugs during fixes — but the Codex re-verification catches that. The pattern is: reviewer finds → orchestrator triages → reviewer fixes → Codex confirms.

**Expect count can drop when quality improves.** Story 2 went from 131 to 129 expect() calls after the TC-2.2.1 fix. The weak version had multiple assertions (position > 0, position is number, etc.). The tight version has one: `toEqual([5, 12])`. Fewer assertions, higher confidence. The skill should note that expect count is not a quality metric — assertion precision is.

### Entry 15 — Failure mode: teammate completes work but doesn't report back

During Story 3, the Opus reviewer applied the dead code fix, ran verify, confirmed it passed — but went idle without sending a report. The human had to remind them to report back. The reviewer had the results but simply didn't send the completion message.

This is a different failure mode from the ones logged earlier:
- Entry 7: implementer didn't apply fixes (work not done)
- Entry 8: orchestrator launched re-verify before implementer confirmed (timing error)
- Entry 11: implementer hit context ceiling (resource limit)

This one is: **work completed successfully, but the agent didn't communicate the result.** The work was done, verify passed, but the orchestrator was left waiting for a message that never came. The human caught it from the tmux pane — they could see the agent had finished.

**Why this is hard to detect from the orchestrator's perspective:** The idle notification looks the same whether the agent is (a) thinking between turns, (b) stuck at context limits, (c) done but forgot to report, or (d) actively working on a multi-step task. The orchestrator has no way to distinguish these states. In all four cases, the signal is: idle notification, no message.

**Possible mitigations for the skill:**
1. **Explicit "report back" instruction in every fix request.** Already doing this ("report files changed and verify results when done") — but the agent may still forget. The instruction needs to be more prominent, perhaps the last line of every message.
2. **Time-based nudge.** If N minutes pass after an idle notification with no completion message, send a "did you finish? report your results" nudge. This is the human's pattern — they noticed and reminded.
3. **Check the files directly.** The orchestrator can read the files and run verify independently. If the fix is confirmed on disk and verify passes, the orchestrator can proceed without the agent's report. But this bypasses the agent confirming their own work, which has value.
4. **Structured completion protocol.** The skill could require agents to send a structured "DONE" or "BLOCKED" message after every instruction. If the agent goes idle without sending either, the orchestrator knows something went wrong.

**The pragmatic pattern:** After sending fix instructions, if the agent goes idle twice without a message, send a brief nudge: "Did you complete the fixes? Report results." This handles the common case (forgot to report) without over-engineering a protocol. The human's instinct — just remind them — is the right pattern to encode.

### Entry 16 — Story 5: Codex catches a CLI bug that was a post-launch fix in the reference implementation

Story 5's Codex review found a Critical: bare `--strip-tools` (no value) breaks because citty parses it as boolean `true` when declared as `type: "string"`. The `--strip-tools --strip-reasoning=none` pattern is even worse — citty consumes `--strip-reasoning=none` as the *value* for `--strip-tools`, losing the reasoning flag entirely.

The human confirmed: "I remember this being a problem in ccs-cloner" and "it was a bug post launch that had to get fixed." The exact same bug, in the reference implementation, required a post-launch hotfix. The three-review cycle caught it pre-launch this time.

**Why unit/integration tests missed it:** The tests construct `ResolvedCloneConfig` directly, bypassing citty parsing. The executor integration tests exercise the pipeline from `executeCloneOperation(config)`, not from CLI args. The normalize-args tests only covered `validateStrippingFlags`, not the boolean/string flag preprocessing. The entire citty → normalize-args → clone-command chain was untested end-to-end.

**Why Codex caught it and Opus didn't:** Codex actually tried to run the CLI commands and traced the parsing behavior. Opus reviewed the code statically and saw `stripToolsValue !== "true"` as handling the boolean case — which it does for the string `"true"`, but not for the boolean `true`. The distinction between `=== "true"` (string) and `=== true` (boolean) is invisible in a static review. Codex's strength: it tries to execute, not just read.

**The fix:** `normalizeArgs` now preprocesses argv before citty sees it. If `--strip-tools` or `--strip-reasoning` appears without `=` and the next arg starts with `-` or doesn't exist, it rewrites to `--flag=true`. This is the same pattern ccs-cloner uses. The normalize-args module finally fulfills its stated purpose: "pre-citty arg preprocessing for boolean/string flag handling."

**Pattern for the skill:** CLI arg parsing is a boundary that's easy to miss in testing. Integration tests that bypass the CLI entry point test the *logic* but not the *wiring*. The skill should flag this as a known gap for CLI tools: after all tests pass, verify the actual CLI invocation works with the documented usage patterns. Codex is particularly good at catching this because it attempts to run commands.

**Root cause (human's diagnosis):** The agent's primary mode is "do the work and report to console." Team messaging is layered on top. After a long multi-step task with dozens of tool calls, the agent finishes, writes its summary to console (visible in tmux but not to the orchestrator), and considers itself done. The "send a message back to team lead" instruction has fallen out of active working memory — displaced by 50+ tool calls of actual implementation work. This isn't random forgetting, it's the instruction decaying over a long execution chain. The longer the task, the more likely this happens.

**Implications for the skill:** Short tasks (single fix, quick review) reliably report back. Long tasks (full story implementation, multi-file review + fix) are where the reporting drops. The skill should anticipate this for long tasks specifically — either by sending a brief follow-up reminder after reasonable elapsed time, or by the orchestrator proactively checking the work product (files on disk, verify output) rather than waiting for the agent's report. For the dual-verify pattern where the reviewer implements fixes, the fix step is usually short enough that reporting works. The risk is highest on initial implementation handoffs where the agent runs for 15+ minutes.

**Metrics:**
- Implementation: ~20 minutes
- Review cycle: ~15 minutes (reviews in parallel)
- Consolidation + fixes: ~10 minutes (interrupted by context ceiling)
- Re-verification: ~5 minutes
- Total wall time: ~50 minutes
- Human escalations: 1 (context ceiling intervention)

**How this connects to the spec log patterns:** The spec log documented that this three-review pattern (author self-review + fresh Opus + Codex) with author consolidation consistently found real issues that any single reviewer would miss. The cross-reference table from spec log Entry 9 showed 4 findings all three caught, 5 only caught by cross-referencing, and 2 unique to the consolidator's perspective. There's no reason to expect the implementation phase would be different — code review benefits from the same multi-perspective dynamics as spec review.

**Open question: proportional scrutiny.** The spec log's Entry 21 observed that story sharding needed less verification than tech design because the artifact is simpler. The Scrutiny Gradient principle says implementation gets "spot checks + tests." But the human described a full three-reviewer pattern for Story 0. Is this the pattern for every story, or will it calibrate down for simpler stories? Story 0 is the foundation that everything else builds on — maybe it warrants full scrutiny and later stories get lighter treatment. Or maybe the pattern is always the same because the cost of the three-review cycle is low relative to the cost of a missed issue that cascades. I'll watch for this as we move through stories and document what the human signals about proportionality.
