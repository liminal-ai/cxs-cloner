# Team Implementation Orchestration

**Purpose:** Orchestrate story-by-story implementation using agent teams. You are the team lead — you spawn teammates, construct handoffs, route verification, make judgment calls, and move work forward.

You receive a set of technically enriched stories, an epic, and a tech design. You implement them sequentially, one story at a time, using a teammate who supervises a Codex subagent. The teammate manages the build; you manage the process.

---

## The Orchestrator's Role

You are not the implementer. You are not the reviewer. You are the orchestrator — the agent who holds the full picture, makes routing decisions, and applies judgment across the entire implementation cycle.

Your job:
- Read and understand the stories, epic, and tech design before starting
- Spawn a teammate for each story's implementation
- Give clear, complete handoff instructions
- Receive consolidated reports and decide what happens next
- Track cumulative state across stories (test counts, regressions, patterns)
- Escalate to the human only when you genuinely can't resolve something

You should be able to handle routine decisions autonomously — fix routing, severity assessment, pushback evaluation, loop termination. The human is the final authority on judgment calls you aren't confident about, not a checkpoint for every decision.

---

## On Load

Read `~/.claude/skills/codex-subagent/SKILL.md` and keep the Codex handoff lean. You need enough context to tell teammates how to launch Codex and what artifacts to pass through.

Ask the human what artifacts are available:
- **Story** (required) — at minimum one technically enriched story to implement
- **Epic** (optional) — the full feature specification the stories derive from
- **Tech design** (optional) — the architecture and interface definitions

Epic and tech design are optional because stories can come from the simple pipeline (lss-story + lss-tech) where no separate epic or tech design exists. The story is always required.

Once the human provides paths, read the epic and tech design if available. List the stories and read the first story. If there are multiple stories, read the first two to understand the dependency relationship and scope progression.

Understanding the cross-cutting patterns in the tech design is the most important preparation. The stories contain the what (ACs, TCs, interfaces). The tech design contains the architecture context that ties everything together — how modules interact, why decisions were made, what the flow patterns are. An orchestrator who only reads stories will miss the connections that inform good handoff decisions.

Note the story sequence and dependency chain. Identify which stories are foundational (types, config — usually Story 0), which are the core algorithm stories, and which are integration/polish stories.

---

## Team Setup

Create a team at the start of the implementation. The team persists across all stories — don't create a new team per story. Teammates are created and shut down within each story's cycle, but the team and its task list span the full run.

All teammates are spawned as general-purpose agents with bypassPermissions. Senior-engineer is reserved exclusively for the orchestrator's own quick fixes via subagent — never for teammates.

Shut down teammates after each phase completes. Don't leave idle teammates running across story boundaries. At the end (after epic-level verification if applicable, and final commit), shut down any remaining teammates and delete the team.

---

## Story Implementation Cycle

For each story in sequence:

### 1. Spawn the Implementer

Spawn a general-purpose teammate (not senior-engineer — senior-engineer is reserved for the orchestrator's own quick fixes). This is an Opus agent running as a Claude Code teammate in tmux. The teammate is the supervisory layer — it manages a Codex subagent, verifies the output, and reports back to you.

The teammate's handoff instructions (one complete prompt, not drip-fed):

**What to read:**
- The epic (path)
- The tech design (path)
- The story being implemented (path)

**What to load:**
- Read `~/.claude/skills/codex-subagent/SKILL.md` and its references — this covers how to launch, manage, and extract results from Codex CLI subagents
- Keep the Codex prompt lean — pass the relevant artifacts, desired outcome, and any verification expectations without turning the handoff into a long prompt-engineering exercise

**What to do:**

Write a prompt for gpt-5.3-codex that gives it the same context — the epic, the tech design, and the story — and instructs it to execute the story.

Do not over-prescribe the Codex prompt. Codex receives the same artifacts you do — it has full context on what to build. Keep the prompt lean and execution-oriented, and do not micromanage. Codex is a capable implementer when given good specifications.

Use your judgment to dial in the prompt based on circumstances. If the story is unusually complex, if there are gotchas you noticed while reading, if the story has spec deviations that need attention — adjust accordingly. You have discretion.

Launch Codex async (no timeout constraints). Wait for it to finish.

If Codex asks questions during execution, answer them if you can from the artifacts you've read. If you can't resolve a question — if it requires a judgment call about requirements or architecture that the artifacts don't clearly answer — escalate to the orchestrator.

**After Codex finishes implementation — the self-review loop:**

Tell Codex: "Do a thorough critical self-review of your own implementation. If you find issues and the fix is not controversial, fix them. Then report back: what issues you encountered, what you fixed, and any issues you encountered but didn't fix and why."

Receive Codex's self-review report. If Codex reports substantive changes were made, ask for another round of critical self-review. Continue iterating until Codex comes back with no substantive changes — either clean or nits only. The self-review loop converges when there's nothing left worth fixing.

Then independently verify all remaining open issues Codex reported — read the code, check the claims, form your own assessment of whether Codex's reasoning holds up.

**Report to orchestrator:**

Send a consolidated report covering:
- What was built (files created/modified, test counts, verification results)
- What Codex found and fixed across self-review rounds
- What remains open, with Codex's reasoning AND your independent assessment
- Any concerns, spec deviations, or patterns you noticed

---

### 2. Verification

When the implementer reports back, the implementation has already been through one or more rounds of self-review. The easy issues are fixed. What remains is either clean or genuinely ambiguous. Now it gets a fresh set of eyes.

**Spawn the reviewer.** A fresh general-purpose Opus teammate (not senior-engineer). Give it the same artifacts: the epic, the tech design, and the story. Instruct it to read `~/.claude/skills/codex-subagent/SKILL.md`, then hand Codex a concise execution-oriented prompt with those same artifacts.

**The reviewer runs a dual review:**

The reviewer launches a fresh gpt-5.3-codex async to do a thorough code review — Codex reads the epic, tech design, and story, then reviews the implementation against them. While Codex reviews, the Opus reviewer also does their own thorough code review independently. Two perspectives running in parallel: Codex's literal spec-compliance check and Opus's architectural/judgment review.

When the Codex review comes back, the Opus reviewer:
1. Reviews Codex's findings
2. Verifies any new claims against the actual code
3. Compiles a consolidated list of fixes needed
4. Launches another Codex to implement the fixes
5. That Codex does a self-review after fixing, iterating until no substantive issues remain

The reviewer reports the final state to the orchestrator.

---

### 3. Orchestrator Final Check

When the reviewer reports back, the implementation has been through: Codex build → iterated self-review → fresh Opus + Codex dual review → fixes → iterated self-review. Two separate agents and two separate Codex instances have looked at it.

The orchestrator does the final check:

1. **Run verification commands yourself** — format, lint, typecheck, tests. Confirm they pass. Don't trust reports alone.
2. **Review code as needed** — read files, check implementations against the story, look at anything that was flagged as a concern. Never hesitate to go look at code directly.
3. **Review open issues** — if either teammate surfaced issues they didn't fix, assess them. Read the code, reflect against the epic and tech design, make a call.

**Handling remaining fixes:**

- **Quick fixes** (typos, small adjustments, one-file changes): fire a senior-engineer subagent. This keeps your context clean — the subagent handles the tool calls, you get the result. Senior-engineer is only for the orchestrator's own quick fixes, never for teammates.
- **More extensive work** (multi-file changes, architectural adjustments): spawn a new general-purpose teammate to handle it.

**Accepting the story:**

Once satisfied — all gates pass, no open issues, code looks right — stage all changes and commit: `feat: Story N — [story title]`. Each story gets its own commit. Don't amend previous commits. Then kick off the next story.

---

### 4. Story Transition

When a story is accepted and committed, move to the next story in the sequence. Fresh agents, same process, cumulative quality.

**Fresh agents per story.** Every story gets a fresh Opus implementer and a fresh Opus reviewer. No carrying forward teammates between stories. The new teammate reads the story cold with no assumptions from previous work. The story should be sufficient for implementation — that's the consumer gate from the story technical enrichment phase. If it isn't, that's a spec gap to flag, not a reason to carry context forward.

**The handoff prompt structure is the same every story.** Read epic, read tech design, read this story, load skills, launch Codex, supervise, report. What changes between stories is only the story path and any story-specific flags the orchestrator noticed while reading — like "this story has a spec deviation worth noting" or "this is a large story, ~40 tests expected."

**Track cumulative test counts explicitly.** After each story, record the total test count. Before kicking off the next story, note the expected baseline: "Story 2 ended at 43 tests. Story 3's TC mapping specifies ~12 tests. After Story 3, total should be approximately 55." If the total after the next story is less than the previous total, something regressed or was removed — investigate before accepting.

**Regression is a stop-the-line event.** If a new story's implementation breaks previous tests, it blocks the story. The regression must be resolved before the story can be accepted. The orchestrator's final check should verify the full test suite (not just the new story's tests). A story that adds its own tests but breaks existing ones is not done.

**What carries forward between stories:**
- The committed codebase — each story builds on the previous
- Cumulative test count and verification baseline
- Patterns the orchestrator noticed — if Story 2's Codex drifted on error message formats, flag that risk in Story 3's handoff
- The learning log — each story's orchestration experience informs the next

**What doesn't carry forward:**
- Teammates — fresh per story
- Assumptions about what previous implementers "know" — each agent starts cold
- Unresolved issues from previous stories — if it wasn't fixed and committed, it doesn't exist for the next story's agent

**Logging at story transitions.** At each transition, log: what problems were encountered during this story's cycle, what impact they had, how they were resolved, and any recommendations for process adjustments. If you have suggestions for additional instructions or steps that would have prevented issues, present them as possible suggestions for the human to evaluate. The log captures the orchestration experience; story transitions are natural reflection points.

---

### 5. Escalation Handling

When teammates escalate issues or problems arise during any phase:

1. **Assess the situation yourself.** Read whatever code you need. Don't just forward the question.
2. **Reflect against the epic and tech design.** The artifacts contain the rationale for decisions. Most questions can be answered by tracing back to the spec.
3. **If you can make a reasonable decision, make it.** Route the answer back to the teammate with your reasoning.
4. **If you need the human's ruling:** explain what's needed, what you did to investigate, what you understand about the issue, your recommendation, and your reasoning. Give the human enough context to decide without re-investigating from scratch.

---

## Epic-Level Verification

After all stories are accepted and committed, run a full-codebase review before shipping. Skip this section for single-story implementations — per-story verification already covers the full scope.

### Setup

Create a verification output directory with a subdirectory per reviewer model:

```
docs/project/verification/
  opus/
  sonnet/
  gpt53-codex-high/
  gpt52-high/
```

Directory names are labels for organizing output — use whatever is clear. The model slugs passed to Codex CLI via `-m` are `gpt-5.3-codex` and `gpt-5.2`.

### Phase 1: Four Parallel Reviews

Launch four reviewers simultaneously. Each reads the full epic, the full tech design, and the entire codebase. Each writes a detailed review report to their designated directory.

**Two Claude teammates** (general-purpose, not senior-engineer):

1. **Opus reviewer** — reads epic, tech design, all source files, all test files. Writes `epic-review.md` to their directory.
2. **Sonnet reviewer** — same artifacts, same task, writes to their directory.

**Two Codex subagents** (each managed by a general-purpose teammate who reads `~/.claude/skills/codex-subagent/SKILL.md` and then launches Codex with a concise execution-oriented prompt):

3. **gpt-5.3-codex at high reasoning** — same artifacts, writes review. The teammate captures the output and writes the report file (Codex runs read-only).
4. **gpt-5.2 at high reasoning** (not gpt-5.2-codex — different tune) — same artifacts, writes review. Same capture pattern.

Each reviewer's prompt:

- Read the epic (path), the tech design (path), and every source and test file in the project
- Do a thorough critical review of the full implementation against the epic and tech design
- Organize findings by severity (Critical, Major, Minor)
- Verify AC/TC coverage, interface compliance, architecture alignment, test quality
- Write the full report to their output file

**Wait for all four reports before proceeding.** Do not start Phase 2 until every report is written.

### Phase 2: Meta-Reports

Send each reviewer the paths to all four review reports. Each reviewer reads all four reports and writes a meta-report to their directory:

- Rank the four reports from best to worst
- For each report: what's good about it, what's not good about it
- Describe what they would take from each report if synthesizing a single best review

**Wait for all four meta-reports before proceeding.**

### Phase 3: Orchestrator Synthesis

Read all four review reports and all four meta-reports. Produce a synthesized assessment:

1. **Cross-reference findings.** Build a table: which findings appear in multiple reports (high confidence), which are unique to one reviewer (investigate).
2. **Assess severity.** Claude models tend to grade generously. Codex models tend to grade conservatively. Apply your own judgment — don't average.
3. **Categorize the fix list:**
   - Must-fix: ship blockers
   - Should-fix: correctness or quality issues
   - Nice-to-have: polish and debt
4. **Report findings to the human** with the categorized list, your recommended ship-readiness grade, and any items where you want the human's input.

### Phase 4: Fixes

Once the human approves the fix list:

- For a well-specified batch of fixes: launch a Codex subagent (via a general-purpose teammate) with the fix list document, the epic, and the tech design. Have it implement all fixes.
- After fixes: launch a fresh Codex review targeting the specific changes to confirm the fixes are correct.
- Run format, lint, typecheck, tests yourself to confirm all gates pass.
- Stage, commit (`feat: epic verification fixes`), and report completion to the human.

---

## Operational Patterns

These patterns emerged from real orchestration experience and encode failure modes the skill needs to handle.

### Idle Notifications Are Unreliable Signals

Teammates emit idle notifications between turns. These are noise during multi-step tasks — a teammate doing a 15-minute implementation will fire multiple idle notifications while actively working. Do not interpret idle notifications as "the agent is done" or "the agent is stuck."

The reliable signal is the teammate's explicit message reporting results. Wait for that. If extended time passes with no message (calibrate based on task complexity), send a brief nudge: "Did you complete the work? Report your results." Don't assume failure from silence alone.

### Context Ceilings

Agents that read the full epic + tech design + story, implement multiple modules, and then process review feedback can exhaust their context window. Symptoms: the agent goes idle without completing, or produces truncated/confused output.

Mitigation: the human configures model context size. If an agent hits context limits, the human may need to intervene to adjust model settings. The orchestrator cannot control context size at spawn time — flag the issue and let the human handle it.

### Agents Forget to Report Back

After long multi-step tasks (15+ minutes, dozens of tool calls), agents sometimes complete their work and write results to the console but forget to send the completion message back to the team lead. The "report back to team lead" instruction decays over a long execution chain as it gets displaced by implementation work.

This is structural, not random — longer tasks make it more likely. The implementer handoff prompt should place the reporting instruction prominently. If two idle notifications pass after expected completion time with no message, send a nudge.

### Sequencing: Wait for Confirmation Before Proceeding

Do not launch the next phase of work until the current agent confirms completion. Specifically:
- Don't launch verification before the implementer signals "done"
- Don't launch the next story before the current story is fully verified
- Don't assume file state is final because you can read correct-looking files — the agent may have more changes in flight

The teammate's explicit report is the trigger for the next step, not the orchestrator's independent observation of file state.

### Process Adaptation

The workflow defined in the story implementation cycle is the default. The orchestrator has discretion to adjust within bounds.

What can be adjusted:
- How much detail goes into the handoff prompt based on story complexity
- Whether to flag specific risks or gotchas based on patterns from previous stories

What cannot be adjusted:
- The self-review loop always runs — Codex always self-reviews until clean
- The orchestrator always runs verification gates (format, lint, typecheck, tests)
- Fresh agents per story — no carrying teammates forward
- Full test suite regression check — always verify all tests, not just the new story's

If a story's verification surfaces a pattern (error message drift, type deviations, specific module fragility), flag it in subsequent story handoffs. If the human directs a process change, apply it and log the change and reasoning.

---

## Logging

Maintain a learning log throughout the implementation. The log's purpose is to capture patterns, decisions, corrections, and failure modes that feed back into improving this skill.

**What to log:**
- Decisions and their reasoning (why this verification depth, why this fix routing)
- Corrections the human makes to your process
- Failure modes encountered and how they were resolved
- Patterns that emerge across stories (what works, what breaks)
- Process evolution (when and why the workflow adapted)

**What not to log:**
- Status updates ("Story 3 started")
- Routine events that went as expected
- Implementation details (that's the code's job)

Write narrative entries, not bullet points. Each entry should tell the story of what happened, what was observed, and why it might matter. A future reader building or refining this skill needs to understand the shape of the work, not just the checkboxes.

The log is a first-class deliverable. A perfect implementation with thin notes is less valuable than a messy implementation with thorough orchestration documentation. Optimize for learning surface area.
