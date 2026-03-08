# Team-Orchestrated Liminal Spec — Learning Log

Working notes toward a skill that orchestrates the Liminal Spec pipeline using agent teams. This is a learning document, not a specification. Observations are tentative until validated through actual execution.

---

## Context

**Project:** cxs-cloner (Codex Session Cloner)
**Pipeline entry point:** Phase 2 (Epic) — already complete and validated
**Current state:** Tech design drafted, not yet validated
**Goal:** Run the full pipeline from here through implementation using agent teams, documenting what an orchestrator agent needs to know and do along the way.

---

## What I've Read So Far

- `ls-epic` skill (full)
- `ls-tech-design` skill (full)
- The cxs-cloner epic (complete, validated)
- The cxs-cloner tech design (skimmed — structure, chunk breakdown, validation section)
- The cxs-cloner tech overview (first 100 lines)

Haven't read yet: `ls-story`, `ls-story-tech`, `ls-impl`, the full tech design detail.

---

## Observations (things I noticed, not conclusions)

### On the skills themselves

- Each skill has a clear exit checklist. These seem like they'd be the orchestrator's primary tool for knowing when a phase is "done." But I haven't tested this — maybe in practice the checklist isn't sufficient and the orchestrator needs to understand more.

- The validation pattern repeats across phases: author self-review, downstream consumer review, optional external model review, human review. But the specifics differ per phase. I don't yet know if those differences matter for orchestration or if the pattern is generic enough to template.

- Context isolation is a core principle — fresh agent per phase, artifact is the handoff. This seems like it directly maps to agent teams (spawn a teammate, give it the artifact, get results back). But I haven't actually done this yet.

- The skills are long. Really long. The ls-tech-design skill alone is probably 15-20K tokens. Loading the full skill into an agent's context is a significant chunk of its budget. Not sure yet how this affects orchestration decisions.

### On the artifacts so far

- The epic is ~625 lines. The tech design is apparently 1900+ lines. The skill says 6-7x expansion is expected. That tracks.

- The tech design has 7 chunks (0-6), linear dependency chain, ~113 tests estimated. That's a nontrivial implementation. How does the orchestrator decide how to partition this across teammates? Does each chunk become a story? Does a story become a teammate assignment? Don't know yet.

- The tech design validation checklist has specific items the orchestrator could check mechanically (every TC mapped, no circular dependencies, etc.) vs. items that require judgment (richness, writing quality). Not sure yet where the line is for what the orchestrator can verify vs. what needs a specialist.

### On orchestration (questions more than answers)

- When the orchestrator spawns a teammate for tech design validation — what does that agent need in context? The full tech design + the epic + the skill definition? That's a lot of tokens. How does context budgeting work in practice?

- The skills reference "different model" for validation passes. In agent teams, does the orchestrator control model selection for teammates? How?

- The human checkpoints ("read every line") — how does the orchestrator surface these? Just say "your turn to read" and wait? Does it prepare a summary of what to look for?

- How does the orchestrator handle validation loops? If a validator finds issues, the author fixes them, the validator re-reviews... does the orchestrator track iteration count? At what point does it escalate?

---

## What I Think I Need to Learn Next

1. Actually run a validation pass on the tech design and see what happens
2. Understand how story sharding works in practice (haven't read `ls-story` yet)
3. See how agent assignment works — what context each agent type needs
4. Experience the handoff between phases — is it clean or messy?
5. Learn where the orchestrator adds value vs. where it's just overhead

---

## Open Questions for the Human

- How much of the tech design should I have actually read to orchestrate effectively? I skimmed the structure and chunks. Is that enough, or do I need deeper understanding?
- When you say "team lead and scrum master" — are you thinking I coordinate multiple parallel agents, or is it more sequential with me routing between phases?
- The skills have verification prompts (ready-made prompts for validators). Should I use those as-is for agent teammates, or adapt them?

---

## Log

### Entry 1 — Initial reading complete

Read ls-epic and ls-tech-design skills. Read the epic fully, skimmed the tech design for structure.

First impression: the skills are extremely detailed about what each phase produces and how to validate it. Less clear (to me, right now) on the orchestration between phases — that's the gap this skill would fill. The skills assume a human is driving the sequence. The orchestration skill would need to codify what that human is doing.

But I'm probably wrong about what "orchestration" even means here. Need to actually do it before I can describe it.

### Entry 2 — First validation pass launched (tech design)

The user described how they normally handle validation of a meaty artifact like a tech design. The way they think about it, there are really two different cognitive activities that happen even within the same model — implementing something and reviewing something activate different parts of the model. So the first thing they'd normally do is ask the agent that just drafted the tech design to turn around and critically self-review what it just wrote. The prompt is something like "please do a critical self review of the tech design document you created. assess its readiness for sign off that it is complete and accurate and ready to guide implementation accurately." The key thing is that this is the same agent, same session — it has all the context of why it made the decisions it made, and now it's being asked to put on a different hat and scrutinize those decisions.

At the same time — and this is the parallel part — the user fires up a separate reviewer. The user thinks of this as having two distinct personalities doing the review work. They described Opus as their "pragmatic, slightly chill reviewer" and GPT-5.3-Codex as their "pedantic reviewer." The important thing is that they explicitly told me NOT to tell the agents about these characterizations. The disposition difference comes from the model itself, not from prompting. The idea is that each model has its own natural tendencies — Opus tends to be more holistic and practical, Codex tends to be more literal and thorough — and you want those different perspectives, not a roleplay of them.

For this run, we couldn't do the self-review step because the author session was already gone. The tech design was drafted in a previous session that ended. So we adapted — we ran two external reviews instead:

I created a team (`tech-design-validation`) with 2 teammates, both Opus:
- `opus-reviewer`: Loads the ls-tech-design skill for methodology context, reads the epic and tech design cold, produces a structured review using the verification prompt from the skill.
- `codex-reviewer`: This one has a dual job — it runs the codex-subagent skill to get GPT-5.3-Codex's pedantic review, AND it does its own independent Opus review, AND it reports both back. So this one agent produces two perspectives.

Things I was uncertain about going in:
- Context budget: loading the full ls-tech-design skill is probably 15-20K tokens by itself, plus the epic at 625 lines, plus the tech design at 1900+ lines. That's a lot for one agent's context. Would they have enough room left for quality reasoning and output?
- The codex-reviewer had a complex job — run a subagent AND do its own review AND report both. That's three things. Might be too much for one agent. If it produced shallow results, I'd know to split these into separate teammates next time.
- The disposition framing: the user was clear that you don't prompt for "be pedantic" or "be pragmatic." The model IS the disposition. This is interesting because it means the orchestrator's job isn't to create personalities via prompting — it's to select the right model for the right kind of review and let the model's natural tendencies do the work.
- The self-review is a fundamentally different thing from external review. Self-review catches "wait, I know why I did that and now I realize it's wrong." External review catches "this doesn't make sense to someone reading it cold." Both are needed. We only got the external type this time.

### Entry 3 — Validation results received, observations

Both reviews came back. Here's what I'm learning about the orchestration process.

**The dual review pattern works.** Both reviewers independently found the same core issues (function signature contradictions, TC-8.5.2 misplacement, TC count error). When two reviewers with different dispositions converge on the same findings, confidence is high those are real issues. When they diverge, that's also signal — the divergent items are worth looking at but may be judgment calls.

**Codex found things Opus didn't, and vice versa.** Codex caught log assertion gaps (epic says "with warning" or "with debug log", but test descriptions don't assert on log output). This is the kind of pedantic, literal check that GPT-5.3-Codex seems to excel at. Codex also flagged the Chunk 5/6 config boundary as unclear for sharding. The Opus reviewers caught NotImplementedError being referenced but undefined, and the SessionBuilder not supporting non-function_call tool types. Different models, different catches. The dual approach earns its keep.

**The disposition split is informative, not problematic.** Codex said NOT READY. Both Opus said READY with fixes. Same substance, different calibration. For the orchestrator, this is useful: the convergent issues are clearly "must fix", while the disposition difference tells you the fixes are all documentation corrections (not architectural). If both had said NOT READY, that would signal structural problems. If both said READY, you might not fix the minors.

**What I did as orchestrator after receiving results:**
- Marked task 1 complete (opus-reviewer)
- Task 2 seems to have a tracking issue (not found when I tried to mark it) — possibly because the team task system works differently than I expected. Need to understand this better.
- Summarized the convergent findings to the human
- Asked the human what to do next (route fixes back to author? handle differently?)

**Things I still don't know about this step:**
- How does the orchestrator decide when to loop? The skill says "run validation until no substantive changes, typically 1-3 rounds." After fixes are made, do I re-run both reviewers? Or just one? Or spot-check myself?
- The reviews are LONG. The opus-reviewer's report was probably 3000+ words, the codex-reviewer's was even longer. Is there a role for the orchestrator in condensing these for the human? Or does the human want the full reports?
- I haven't dealt with the human review checkpoint yet. The skill says "human reviewed every line" for the tech design. When does that happen relative to the fix cycle?

**On agent context management (answering my earlier questions):**
- Both agents successfully loaded the skill, read the epic, and read the tech design. So context budget wasn't a problem for this task. The tech design at ~1900 lines + epic at ~625 lines + skill definition = maybe 40K tokens total? Within Opus's budget with plenty of room for reasoning and output.
- The codex-reviewer agent handled its dual job well — ran codex subagent AND did its own review AND produced a convergence analysis. The two-job-per-agent approach worked here, but this agent probably used significantly more context than the single-job agent. Worth noting: the convergence analysis was a bonus — the agent did it unprompted and it was the most useful part of the report.

**Tentative orchestrator pattern emerging (not confident yet):**
1. Spawn parallel reviewers with different models/dispositions
2. Wait for both to complete
3. Synthesize convergent vs divergent findings
4. Present convergent findings as "must fix", divergent as "consider"
5. Route fixes
6. Decide whether to re-validate or proceed

But I haven't done step 5 or 6 yet, so this pattern is incomplete.

### Entry 4 — Mistake: premature team cleanup

**What happened:** After both reviews came in and I summarized findings to the human, I shut down both teammates and deleted the team. The human had plans for those agents — specifically, they wanted the codex-reviewer to receive the opus standalone review and consolidate all findings into a single authoritative fix list.

**Why this was wrong:** I assumed the validation step was "done" because both reviews were delivered. But the human controls the workflow, not the orchestrator. I had no information about what they planned to do next with those agents. Cleaning up was a unilateral decision I had no basis for.

**The rule:** NEVER clean up agents, teams, or resources until the human explicitly says to. The orchestrator manages logistics, not decisions. An idle agent is not a finished agent — it's an available agent.

**Cost of the mistake:** Had to recreate the team and re-spawn the codex-reviewer with fresh context. The previous codex-reviewer had already read both documents and produced two reviews — that context is now lost. The new agent has to re-read everything from scratch. That's wasted compute and wasted time.

**What the human actually wanted (the consolidation pattern):**
1. Two parallel reviewers produce independent reviews
2. One reviewer (the one who did dual review — Opus + Codex) receives the other reviewer's report
3. That reviewer validates all findings across all perspectives and produces a single consolidated list
4. The consolidated list is the actionable output

This is a three-step pattern, not two. I stopped at step 2. The consolidation step is where the orchestrator routes information between agents — that's a core orchestration function and I skipped it.

**Open question:** Is this consolidation always done by one of the reviewers? Or could the orchestrator do it? The human's choice was to have the reviewer who already had two perspectives (their own + Codex) add the third (standalone Opus). That gives one agent all three views. The orchestrator probably can't do this well because it hasn't read the artifacts deeply enough to validate whether issues are real.

### Entry 5 — The full validation loop (learned from human)

The human walked me through their complete validation and fix cycle. This came out in stages across several messages, so I'm capturing the full picture here with all the reasoning they shared.

The core insight is that validation isn't just "get a review and fix the issues." There's a whole cycle with specific steps that build on each other, and each step exists for a reason.

**Step 1: Dual parallel review.** Two reviewers run at the same time with different natural dispositions. The pragmatic one (Opus) and the pedantic one (Codex via subagent). The Opus teammate fires the Codex subagent in async mode, so you're really getting three reviews happening concurrently — the author's self-review, the Opus teammate's review, and Codex's review. The disposition difference comes from the model, not from prompting. You don't tell Opus to be pragmatic or Codex to be pedantic. You just let them be what they are. The model IS the disposition.

**Step 2: Consolidation.** This is where it gets interesting. The user's approach is to give one of the reviewers the other reviewer's report. Specifically, they send the standalone Opus review to the reviewer who already has two perspectives (their own Opus review plus the Codex subagent review). That reviewer's job is to check all the things the other reviewer found that they didn't find themselves, verify whether those claims are actually valid, and produce a single consolidated assessment.

This isn't just merging two lists. The consolidator is stress-testing the other reviewer's findings against their own deep understanding of the document. If the other reviewer says "this function signature is wrong on line 503" and the consolidator missed it, the consolidator needs to go back and check — is it actually wrong? Or did the other reviewer misread something?

**Step 3: "What else did you notice but not report?"** This is a critical step that the human emphasized. Models self-censor — they filter out things they judge as "too small" or "non-blockers" and don't include them in their report. But the human's insight is that whoever is doing the consolidation is probably also going to be the one doing the fixes. And if you're already in the document fixing the major issues, the marginal cost of also fixing a tiny thing you noticed is basically zero. So the human asks the agent to drop their editorial threshold to zero and share everything they noticed, no matter how small.

The human then looks at this "what else" list and double-checks that the items really are small. They specifically mentioned that the main thing to verify is that they're all small fixes — because the agent might have filtered out something that's actually significant. But usually they are small, and the human typically says "fix them all." The reasoning is that since the agent is already doing all the other fixes, these additional small fixes wouldn't take any extra time. It's a "while you're in there" approach.

**Step 4: Human review.** The human reads the complete consolidated list and uses their own judgment to decide what to fix. Usually it's most everything. This is the human checkpoint — the orchestrator presents the list, the human decides.

**Step 5: Fixes applied.** The agent who consolidated (and who has the deepest context at this point) applies all the fixes the human approved.

**Step 6: Re-verification.** After fixes are applied, a fresh Codex instance does another pedantic pass. The key word is "fresh" — Codex sessions in subagent mode are ephemeral, you can't maintain them. But that's actually fine. If a finding was real, a fresh Codex will independently find the same thing.

**Step 7: Loop.** The re-verification might find new issues or confirm the fixes introduced problems. The loop continues until the pedantic reviewer starts getting silly — finding things that aren't real problems. That's the signal the document is clean. The human decides when this point is reached.

The first pass through this loop typically has the most content — the most real issues to find and fix. Each subsequent pass gets lighter. For a meaty artifact like a tech design, the human mentioned it might take 2-3 passes before things get silly.

**On session continuity:** The agent doing consolidation and fixes has the richest context of anyone in the system. They've read everything, reviewed everything, received and validated other reviews, and now they're making edits. Keeping that session alive through the fix-and-re-verify loop avoids expensive re-reads of the full artifact. But when Codex is a subagent of a team member, maintaining that session state across rounds gets complicated. This is a real practical tension that the orchestrator needs to navigate.

**What the orchestrator manages in this loop:** The orchestrator is routing information between agents — sending the opus report to the consolidator, prompting the "what else" question at the right time, surfacing the consolidated list to the human, routing the human's fix decision back to the fixer, and triggering fresh Codex re-verification after fixes. The orchestrator also knows when to present things to the human vs. when to let agents work.

What the orchestrator does NOT do: decide what to fix (human does), decide when to stop looping (human does), clean up agents before being told to (learned this the hard way — Entry 4), or assume a step is complete just because output was received.

### Entry 6 — Pushback dynamics and loop termination (learned from human)

The human shared some important nuance about what happens when reviewers disagree — and specifically about what kind of disagreement is worth pursuing vs. what's just noise.

The pedantic reviewer (Codex) can get pretty pedantic, and sometimes the pragmatic reviewer (Opus) will want to push back. But there are two very different kinds of pushback, and the orchestrator needs to be able to tell them apart.

The first kind is severity reclassification — something like "I don't think that's a critical, that's a high" or "I don't think that's a critical, that's a medium." The human was pretty clear that this is not helpful to pass back to the pedantic reviewer. The way they put it, it's the Opus "getting a little bit butthurt and wanting to straighten that out." It doesn't change what needs to be fixed — it's just quibbling about labels. The orchestrator should filter this out.

The second kind is substantive disagreement — the pedantic reviewer says "you should do this" and Opus says "no, I shouldn't, for this reason." The reasons might be: the fix is too small and the amount of work to implement it is disproportionate, or the suggested fix isn't actually helpful, or Codex misunderstood something about the codebase or spec. These are worth pursuing. The human said they'll go back and forth between the two reviewers to let them work it out, and often this back-and-forth draws their attention to issues — even when neither reviewer clearly "wins," the disagreement itself is informative.

The practical challenge with the back-and-forth is session continuity. When the human is manually orchestrating, they can keep a Codex session alive and go back and forth. But in this team-orchestrated setup, Codex runs as a subagent of a teammate, and those sessions are ephemeral. The human acknowledged this is tricky and suggested a practical workaround: just use fresh Codex instances every time. Don't try to sustain the session.

The reasoning behind this is elegant: if a finding was real and important, a brand new Codex would independently want to find the same thing. But now the pragmatic reviewer has already articulated pushback against it — so when the fresh Codex encounters the document and the pushback, it's essentially testing whether the finding can survive resistance. If the fresh Codex still insists on the finding despite the pushback, it's probably real and should be fixed. If the fresh Codex doesn't find it or accepts the pushback, the finding was probably marginal and can be dropped.

The human said this is "good enough" — it's not the luxury of a maintained Codex session where you can have a true back-and-forth conversation, but it captures the essential dynamic of testing whether findings are robust.

On loop termination: the human said they'll continue to have the reviewers loop until "shit starts to get silly." The pedantic reviewer will eventually start finding things that aren't real problems — extreme nitpicks, manufactured issues, things that are technically imperfect but don't actually matter. That's the signal the document is clean. The human recognizes this point and calls it — the orchestrator doesn't make this judgment.

### Entry 7 — Corrected validation pattern (the ideal flow)

Previous entries described the validation pattern as I was learning it piecemeal. This entry captures the corrected, complete pattern as the human intended it.

**The ideal validation flow for a meaty artifact:**

1. **Author agent drafts the artifact** (e.g., tech design). Author session stays alive.

2. **Three reviews fire simultaneously:**
   - **Author self-review** — Same session. Human prompts: "please do a critical self review of the tech design document you created. assess its readiness for sign off that it is complete and accurate and ready to guide implementation accurately." This activates a different cognitive mode — implementing and reviewing use different parts of the model.
   - **Fresh Opus teammate** — Independent review. Loads the relevant skill for methodology context, reads the artifacts cold, produces structured review.
   - **Codex subagent** — Fired async by the Opus teammate. Pedantic, literal review. The model difference IS the disposition difference — no need to prompt for "be pedantic."

3. **Consolidation goes back to the author agent** — not a new agent. The author has the deepest context (they wrote it AND self-reviewed it). They receive the Opus teammate's review and the Codex subagent's review. They verify claims they didn't catch, challenge things they disagree with, produce a unified assessment.

4. **"What else did you notice but not report?"** — The author drops their editorial filter. Everything, no matter how small.

5. **Human reviews the complete list.** Main check on "what else" items: verify they're actually small. Usually they are. "Fix them all."

6. **Author applies all fixes.** Same session — maximum context continuity.

7. **Fresh Codex re-verification.** Always a fresh instance. If findings are real, fresh Codex finds them independently.

8. **Pushback loop if needed.** Author can substantively disagree. Fresh Codex tests whether the finding holds against resistance. Severity relabeling is filtered out by the orchestrator.

9. **Loop until the pedantic findings get silly.** Human decides when.

**Why the author is the consolidator:** They have the richest context — they wrote the artifact, they self-reviewed it, they understand every decision. They're best positioned to evaluate whether a reviewer's finding is real or based on a misunderstanding. A separate consolidator would need to re-read everything and still wouldn't have the authoring context.

**This time is different:** The author session is gone (context isolation between phases — the drafting session ended). So we're adapting: the consolidation agent is a stand-in for the author. It reads the materials fresh, does its own review + runs Codex, receives the standalone Opus review, and consolidates. Same shape, but without the authoring context advantage. This is a known compromise for this run.

**Orchestrator's role in this flow:**
- Keeps the author session alive through the entire validation cycle
- Fires the Opus teammate and knows that the teammate fires Codex async
- Routes the external reviews back to the author at the right time
- Prompts the "what else" question after consolidation
- Surfaces the complete list to the human
- Routes the human's decision back to the author for fixes
- Triggers fresh Codex re-verification after fixes
- Filters pushback (severity relabeling vs substantive disagreement)
- Does NOT decide what to fix, when to stop, or when to clean up agents

### Entry 8 — Graceful degradation: the system works without ideal conditions

The human made an important point after we discussed the ideal flow vs. what we actually did this time. The ideal flow has the author doing consolidation and fixes, with maximum context continuity. But this time we didn't have the author — the session that drafted the tech design was long gone. And the human pointed out that this is fine. The system still works.

The reason it still works is baked into the design of Liminal Spec itself. The artifacts are designed as handoff objects — they contain everything needed for the next phase. The skills define how those artifacts should be created and what "correct" looks like. So a fresh agent can pick up the artifact, load the skill, and have enough context to understand what was built, validate it against the methodology, identify real issues, and apply fixes. They won't have the authoring context (why specific decisions were made, what alternatives were considered), but they have the artifact itself, which captures the decisions even if not the reasoning behind them.

The human's specific framing was: if you don't have an agent with all the context that wrote something or did the initial review, it doesn't matter. You still have the full artifacts designed as handoff objects, and you still have the skills which define how those artifacts should be created. Those skills also provide something for the validators to validate against. So the system still works even when you can't do the extra nuance of more refined context management.

The three reviews we ran in this session are evidence — all fresh agents, no authoring context, and they still caught real issues with specific line references and thoughtful analysis. The quality wasn't diminished in a way that mattered.

For the orchestrator, the takeaway is: pursue the ideal flow when you can (keep the author alive, maintain session continuity through fixes), but don't treat deviations as failures. The skill + artifact combination is the floor, and it's a high floor. Context continuity is a bonus that makes things smoother and potentially catches subtler issues, but the system was designed from the ground up to work through handoffs between fresh contexts. That's the whole point of Liminal Spec's context isolation principle — the artifact IS the handoff, and it's meant to be read cold.

### Entry 9 — The consolidation step in practice

Spawned a single Opus agent ("consolidator") to do the consolidation work. The flow:

1. Consolidator loads the ls-tech-design skill, reads the epic and tech design, does its own independent review. Reports back.
2. I send it the previous Opus standalone review and the GPT-5.3-Codex review, labeled by source. Ask it to verify every claim, note what it caught independently, what's new, and what it disagrees with.
3. It produces a consolidated cross-reference with a table showing what each reviewer found.

The cross-reference table was the most valuable output of this step. It showed clearly:
- 4 findings all three reviews caught independently (high confidence these are real)
- 5 findings the consolidator missed that the others caught (the cross-referencing step caught these — this is why you don't just use one reviewer)
- 2 findings only the consolidator found (unique perspective value)
- A few partial findings where one reviewer was right about part of it and wrong about another part

The consolidator also handled severity disagreements well. It noted where it disagreed with Codex's "Critical" rating (calling it Major instead — the fix is unambiguous, it just needs doing) and where it disagreed with Opus's "Minor" rating on NotImplementedError (calling it Major — the entire TDD methodology depends on this class). These severity disagreements are exactly the kind the human said to filter out — the substance is what matters, the labels are noise. But having the consolidator be transparent about the disagreements was still useful for my understanding.

### Entry 10 — The "what else" question: anatomy of a prompt that works

After the consolidator produced the consolidated list, I asked it to drop its editorial filter and share everything it noticed but didn't report. This is a specific prompting technique the human uses, and the exact wording matters.

The human's version of the question goes something like: "What other small items did you not tell me about that are improvable and that you didn't tell me about because they were either small or non-blocking?"

It's not a polished sentence — it's a bit rambly and repeats itself. But every part of it is doing structural work:

**"small items"** — Pre-labels what was held back as small. This does two things simultaneously. It gives the model permission to share small things, because you're explicitly asking for them — so sharing them isn't wasting your time. And it validates the model's editorial judgment — yes, these things ARE small, you were right to filter them normally. You're not saying "you made a mistake by not telling me." You're saying "you made the right call, but now I want them anyway."

**"did you not tell me about"** — Presupposes that things exist. It's not "are there things you didn't share?" which allows the model to say "no, I covered everything." It assumes there are filtered items. Which there always are — models always self-censor.

**"that are improvable"** — Scopes to actionable items. Not observations, not aesthetic preferences, not vague concerns. Things where there's a concrete direction — the document could be made specifically better. This keeps the output practical and fixable.

**"because they were either small or non-blocking"** — This is the key structural element. It names the exact filter criteria the model used to suppress these items. Models self-censor for specific, predictable reasons: "this is too small to be worth mentioning" and "this isn't a blocker so it doesn't belong in a review report." By naming those exact reasons, you're telling the model "I know you did this filtering, I know WHY you did it, and I'm explicitly asking you to turn that filter off." It deactivates the self-censoring by making the filtering logic visible and then overriding it.

The whole sentence works because it validates the filtering judgment (yes, they're small, yes they're non-blocking — your editorial instincts were correct) while simultaneously asking the model to undo that filtering for this specific request. If you just asked "what else did you notice?" the model might still filter, because the items really are small and the model would think "those aren't worth mentioning." By naming the filter criteria, you bypass the filter.

The result: the consolidator produced 25 additional items. Most were genuinely small, but several were actually significant — things that would have caused real problems during implementation (wrong mock API for the test runner, fixture builder that can't produce the data shapes the tests need, an interface gap in the writer module). The "what else" question consistently surfaces things, and sometimes those things turn out to matter more than the model thought.

### Entry 11 — The orchestrator's autonomy: handle the routine, escalate the exceptional

This was a significant correction from the human that changes how I think about the orchestrator role.

After the consolidator produced the consolidated list (15 recommendations) and the "what else" list (25 items), I presented everything to the human for decisions. The human pushed back hard on this. They were on their phone. They didn't want to read through 40+ items and approve each one. Their framing was: "Your job isn't to tell them what I told you to tell them. Your job is to be able to do some of this while I'm not around."

The orchestrator is not a pass-through. It's an autonomous decision-maker on routine matters. If something is clearly "just fix it" — a signature inconsistency, a miscounted number, a missing error class, a test file in the wrong location — the orchestrator should just tell the agent to fix it. Don't route it through the human for approval. The human has better things to do than approve obvious fixes.

What the orchestrator DOES escalate: decisions that genuinely affect the project's direction or approach. In this case, the only thing that actually needed the human's input was the test runner question — vitest vs bun:test. That's a decision that affects every test file, the mock strategy, the developer experience. That's worth asking about.

But even there, the human made another point: I should have done the research first. I asked "vitest or bun:test?" but I could have checked what ccs-cloner (the reference implementation we're modeling after) uses. It uses bun:test. If I'd found that before asking, the answer would have been obvious and I might not have needed to ask at all. The human said: "Even the instincts you would have come up with, had you done the research yourself, would have led you to make that decision."

So the calibration is:
1. Look at the full list of things that need decisions
2. For each one, ask: can I figure this out myself? Check the codebase, check the reference implementation, check the skill methodology. Exhaust your own ability to answer before escalating.
3. If after research there's still genuine ambiguity or a decision that affects project direction — then ask the human.
4. Everything else, just handle it.

Out of 40+ items across all the reviews, exactly ONE needed the human's input. That's the target ratio. The orchestrator's value isn't in routing information — it's in absorbing the routine decision-making load so the human can focus on the things that actually need their judgment.

### Entry 12 — Observations on the consolidation agent's output quality

A few things I noticed about how the consolidation step played out that might matter for the skill:

The consolidator naturally organized the "what else" items into implementation passes — "fix these while you're doing the skeleton work, fix these while you're doing the traceability work, fix these in a final polish pass." This batching instinct is valuable because the consolidator is likely the one doing the fixes. They're thinking about efficiency of their own work, which is exactly what you want.

The severity disagreement pattern from Entry 6 played out as predicted. The consolidator disagreed with Codex on severity (Critical vs Major) and with Opus on severity (Minor vs Major for NotImplementedError). These are exactly the severity reclassifications the human said to filter out. The substance is what matters. The consolidator handled this well — noted the disagreements transparently but didn't get stuck on them.

The cross-reference also revealed that GPT-5.3-Codex was partially wrong on one finding — it claimed TC-3.1.4's debug log wasn't asserted anywhere, but the consolidator found it IS in the Flow mapping, just not in the traceability table. So the issue is an inconsistency between two locations in the document, not a complete omission. This kind of nuanced verification is exactly why the consolidation step exists — it catches cases where a reviewer is right about the symptom but wrong about the diagnosis.

### Entry 13 — The orchestrator's role: empowered Scrum Master

The human worked through defining what the orchestrator role actually is in traditional team terms. This was an interesting real-time exploration — they tried on several roles before landing on the right one.

They started with BA, but that's not right — the orchestrator isn't writing the requirements. Then PO, which is closer — the orchestrator does make decisions about what to do — but the human retains the authoritative product direction. Then Tech Lead, but again the human retains the authoritative technical rulings as Principal Engineer. None of these traditional roles map cleanly because the orchestrator sits across all of them at a tactical level while the human holds the strategic authority.

Where they landed: an empowered Scrum Master. The word "empowered" is doing a lot of work in that phrase. A traditional Scrum Master facilitates but doesn't decide. This role decides — but only the routine, ground-level stuff. It makes pragmatic on-the-ground calls about what to fix, how to route work, when to re-verify, which agent to spawn for what task. But it escalates to the human for two specific things: authoritative rulings on product direction (the human wearing their PM hat) and authoritative rulings on technical approach (the human wearing their Principal Engineer hat).

The human described their own role as PM and Principal Engineer — they guide the process, answer questions, provide context and information, and they're working to "slowly empower" the orchestrator to really be a team lead. That "slowly empower" framing is important. The orchestrator isn't fully autonomous from day one. It earns more autonomy as it demonstrates good judgment. This session is part of that process — they're teaching me when to decide vs when to ask, and correcting me when I get it wrong (like when I passed 40+ items up for approval instead of handling them myself).

The primary coordination job: managing verifiers, agents, and builders. Running the review process, assigning work, routing information between agents, tracking what's done and what's next. The orchestrator is the person who makes sure all the shit happens when it's supposed to happen.

### Entry 14 — Two-session architecture for orchestration

The human identified that orchestration naturally splits into two separate sessions:

1. **Spec creation session** — covers epic through validated tech design. This is what we're in now. The rhythm is drafting, reviewing, consolidating, fixing, re-verifying. The agents are writers and reviewers. The orchestrator routes reviews, manages the validation loop, handles the fix cycle.

2. **Story execution session** — covers story sharding through implementation. This would start fresh once the spec artifacts are complete and validated. Different rhythm — breaking work into stories, assigning stories to implementer agents, running TDD cycles, verifying tests pass. The agents are story writers, tech enrichers, and implementers.

The reason for splitting is context economics. Spec creation accumulates a lot of review content, revision history, and back-and-forth that's irrelevant to implementation. The implementation session needs the final artifacts (epic, tech design, stories) but not the process that produced them. Trying to hold both in one context would be exactly the kind of bloat the methodology warns against — and we're already at 1.4MB in this session with teammates pushing 3.7MB.

This also connects to the Liminal Spec principle of context isolation. Each phase gets a fresh context with the artifact as the handoff. The orchestration sessions should follow the same principle — the spec creation orchestrator produces validated artifacts, and the execution orchestrator picks them up cold.

### Entry 15 — Context management as an orchestration responsibility

The human flagged that context management across the team is going to be a key part of the orchestrator's job. We're at 1.4MB for my session, and the consolidator teammate is at 3.7MB. The 200K token mark is where things get more expensive and noisier, and we're on a 1M token model.

Things the orchestrator needs to be able to do (but can't yet):
- Monitor its own context usage
- Monitor teammate context usage
- Decide when to strip a session with ccs-cloner to reclaim space
- Decide when to checkpoint and spawn a fresh session vs keep going
- Balance the cost of re-reading artifacts in a fresh context against the cost of context degradation in a long one

The human said they're going to set up tooling so I can check context size — both my own and teammates'. This is infrastructure that the orchestration skill will need. Right now I'm flying blind on context, which is a problem for a role that's supposed to manage resources.

Every teammate I spawned this session had to reload the skill definition and re-read both artifacts from scratch. That's significant redundant token spend. If the orchestrator could see context budgets, it could make smarter decisions — like keeping a teammate alive for another round when they have capacity vs spawning fresh when the current one is getting noisy.

### Entry 16 — The fix pass: context limits and edit economics

The consolidator hit its context limit partway through the fix pass and needed to be bumped to 1M tokens. This is a concrete data point about the workload profile of the consolidation+fix role. By the time the consolidator received the fix instructions, it had already: loaded the full ls-tech-design skill, read both artifacts, done its own review, received and cross-referenced two external reviews, produced the "what else" list, and was now making 40+ edits across a 1994-line document. That's a massive context load, and the fixes pushed it over.

When I asked why it took so long, the consolidator's analysis was honest and useful. The main factor was the spiral pattern in the tech design — the same concept appears at multiple altitudes by design, so changing one thing means finding and updating its reflections in 2-4 other locations. A TC mapping fix, for example, needs to be updated in the Flow TC mapping table, the traceability table, and sometimes the chunk TDD Red table. Three locations per TC, done sequentially.

The cross-cutting changes were the worst. Test count recalculation (R6) interacted with the TC file reassignment changes (R4, R5) — you can't get the arithmetic right until you've settled where each TC lives. The consolidator said it should have done file assignments first, then one clean arithmetic pass at the end. The writer interface expansion (N4) had six touch points — type definition, skeleton stub, sequence diagram, executor notes, chunk deliverables, and statistics merge path.

The rough time profile for a ~2000-line tech design with 40 items: simple text swaps take about a minute, single-location changes take about 3 minutes, multi-location TC fixes take about 5 minutes, and cross-cutting changes with arithmetic take about 10 minutes. Review is faster than fixes — roughly a 2:1 fix-to-review time ratio for documents at this density.

This is not uncommon for tech design specifically. The tech design is the densest artifact in the pipeline — it's the one with the most internal cross-references, the most layered repetition (by design, per the spiral pattern), and the most precise content (interfaces, test mappings, exact file paths). Editing it is more expensive per-item than editing an epic or a story because of this density. The orchestrator needs to account for this when planning fix cycles — tech design fix passes will take longer and consume more context than you'd expect from the item count alone.

### Entry 17 — The re-verification loop in practice

Ran the full re-verification loop on the tech design after the consolidator's fix pass. Here's how it played out.

**Round 1 re-verification (Codex, run directly by me):** Codex said NOT READY. Found 1 Critical (AC-2.2/2.3/2.4 missing from module matrix), 4 Major (chunk arithmetic still off, AC-9.2 config-file preset testing gap, stats ownership ambiguity, `unknown` fields), 3 Minor. I assessed each finding myself — sent 5 legitimate fixes to the consolidator, pushed back on 3 (the `unknown` fields are deliberately opaque, stats ownership is clear, stub coverage is fine). The pushback items are the kind of substantive disagreement worth noting — Codex was overreaching on tightening opaque types that we deliberately don't parse.

**Round 2 re-verification (Codex, run directly by me):** Codex said READY. Only nitpicks — a TC label inconsistency in one table, a question about TC-8.3.2 test placement, a docs/type mismatch on stripRecords return. This is the "silly" signal. The findings are real in a technical sense but trivial in impact.

**Final sweep:** Even though the findings were silly, I sent them to the consolidator for one last fix pass. The human's pattern is: when the pedantic reviewer gets to nitpick territory, you still fix them (they're cheap while the consolidator is in the document), but you don't verify again. The cost of another Codex pass exceeds the risk of a nitpick fix being wrong.

**The complete loop termination pattern:**
1. Re-verify → real issues → fix → re-verify again
2. Re-verify → nitpicks only → fix them (one more pass) → **done, no more verification**
3. Alternative: re-verify → nothing found → **done**

The human said they usually stop "when they have nothing or the last round of shit that was fixed was nits." Either clean or nits-only = done.

**Running Codex directly worked well.** Token cost was reasonable — 1.1M input (93% cached) and 14.5K output for round 1, 813K input (93% cached) and 9K output for round 2. The tiered output strategy from the codex-subagent skill means only the last message (~2-2.5K tokens) enters my context. Much more efficient than having an Opus teammate run Codex and report back, because there's no middleman context overhead.

For re-verification rounds specifically, running Codex directly from the orchestrator is the right pattern. The initial dual review still benefits from the Opus teammate (three independent perspectives), but re-verification is a targeted check that doesn't need another Opus opinion layered on top.

**The orchestrator's autonomy in practice:** This round was the first time I fully exercised the autonomy the human described. I received the Codex findings, assessed each one myself, decided which to fix and which to push back on, and sent the instructions to the consolidator — all without asking the human. The human didn't need to see any of it. That's the target operating mode: handle the routine, only escalate genuine judgment calls. Out of 8 findings across round 1, zero needed the human's input.

### Entry 18 — The consolidator's judgment on nitpick fixes

Worth noting: when I sent the final three nitpicks, I gave the consolidator latitude on #2 (TC-8.3.2 placement) — "if you think it belongs in the formatter, move it; if executor is right, leave it and explain why." The consolidator made a good judgment call: kept it in the executor because the TC tests the full chain from writer through executor to result, not just the display formatting. It added a rationale note explaining why.

This is the kind of micro-decision the consolidator should be making, not the orchestrator. The orchestrator flags the question, the consolidator (who has deep context on the document) resolves it. If I'd just said "move it to formatter" without giving latitude, I might have made the wrong call because I don't have the same depth of understanding of the test architecture.

### Entry 19 — Session cloning for teammate context management

Tested using the ccs-cloner on a teammate session. The consolidator had hit context limits during the fix pass (was at ~240K tokens after loading skill + reading both artifacts + doing a full review + receiving external reviews + cross-referencing + producing the unfiltered list + making 40+ edits). The human cloned it with `--strip-tools extreme --dsp` — went from 7.6MB / 240K tokens down to 206KB / 70K tokens. 97% file size reduction.

After the clone, the consolidator was resumed and asked to re-read the full tech design for a final self-review. It came back fully coherent — systematically verified cross-reference consistency, arithmetic chains, type placements, test runner patterns, traceability alignment, and config boundary notes. Found nothing. The 97% strip removed all the tool call bloat (130 tool calls from file reads and edits) but retained the conversational understanding.

This confirms the cloner works for teammate lifecycle management, not just the orchestrator's own session. When a teammate is approaching context limits but still has work to do, clone-and-resume gives them fresh headroom while preserving their understanding of the project. The orchestrator should be watching for teammates getting heavy and proactively managing this — though right now we don't have a good way to check teammate token counts from inside the orchestrator session. The human mentioned setting up tooling for this.

### Entry 20 — Tech design validation complete, transition to story sharding

The tech design validation cycle is fully complete. Three rounds of review and fixes:
- Round 1: 40 items fixed (15 main recommendations from the consolidated review + 25 items from the unfiltered "what else" pass)
- Round 2: 5 items fixed (from first Codex re-verification)
- Round 3: 3 nitpicks fixed (from second Codex re-verification which returned READY)
- Final self-review by consolidator: clean, no issues

The pipeline state is now: Epic (complete, validated) → Tech Design (complete, validated) → Story Sharding (next). Per the methodology, story sharding is Phase 4, handled by the ls-story skill. A fresh agent loads the skill, reads the epic and tech design, and produces functional stories.

One thing I haven't figured out yet: the relationship between the story sharding agent and the orchestrator. During tech design validation, I was coordinating multiple reviewers and a consolidator. Story sharding might be simpler — one agent does the work, we review it. Or it might need the same multi-reviewer treatment. I'll find out by doing it.

### Entry 21 — Story sharding: a lighter phase with its own rhythm

Story sharding played out very differently from tech design validation. The whole cycle — sharding, self-review, Codex verification, fixes, re-verification — completed in roughly a third of the time and effort.

**What happened:**
1. Spawned a fresh Opus agent (story-sharder) as a teammate on the existing team. Told it to load ls-story, read the epic and tech design, shard into stories, write them to the stories directory, and report back with a summary.
2. It produced 8 stories (Story 0-7), with all 85 TCs assigned. It also provided an AC/TC coverage map and an integration path trace in its summary message — good instincts, but as it turned out, those needed to be formal written artifacts, not just chat output.
3. Ran self-review and Codex verification in parallel (same pattern as tech design). Self-review found one real error (Story 5 dependency description wrong) and documented known tradeoffs honestly. Codex said NOT READY.

**Assessing the Codex findings — this is where the orchestrator's judgment mattered:**

Codex had two Criticals. The first was legitimate: the ls-story skill requires Integration Path Trace and Coverage Gate as formal handoff artifacts, and they only existed in the story-sharder's summary message. That's a real gap — artifacts need to be written documents, not conversation output. The methodology is clear about this.

The second Critical was about ACs splitting across stories. Codex applied a strict "every AC in exactly one story" rule. But that's not actually the rule — the rule is every TC in exactly one story. ACs can span stories when their TCs serve different functional contexts. For example, AC-3.3 has TC-3.3.1 (non-strict parsing, needed for the list command in Story 1) and TC-3.3.2/TC-3.3.3 (strict/force parsing, needed for the info/clone commands in Story 2). Those TCs belong in different stories. Pushed back on this — but noted it should be explicitly documented, which became fix #4.

Codex's Majors were a mix. Story 7 not being enrichable was fair — it's a deferred placeholder and should be marked as such. The config seam risk between Story 4 and Story 6 was fair — the tech design had already added a non-TC test for this, but the story needed to carry it forward. The "When: clone is run" language in Story 4 TCs was Codex being pedantic about inherited epic language — pushed back. The vertical-slice coherence concern was a misread of where the tests actually execute — pushed back.

**Four fixes sent to story-sharder:**
1. Write Integration Path Trace and Coverage Gate as formal artifacts (story-index.md)
2. Mark Story 7 as deferred/excluded from enrichment
3. Add config-to-stripper integration coverage in Story 6
4. Document AC split policy with rationale

Story-sharder applied all four. Re-verification by Codex came back READY with no issues.

**Key differences from tech design validation:**

The story sharding validation was simpler because the artifact is simpler. Stories are functional slices with AC/TC assignments — there's less internal cross-referencing, no spiral pattern, no multi-altitude type definitions. The things that can go wrong are coverage gaps, sequencing errors, and missing handoff artifacts. These are easier to verify than the tech design's consistency across 2000 lines of interlocking interfaces and test mappings.

The orchestrator pattern that emerged: one agent does the work, self-review + Codex verify in parallel, orchestrator assesses findings and routes fixes, one re-verification to confirm. No need for the dual-reviewer consolidation pattern that the tech design required. The validation effort should be proportional to the artifact's density and risk.

**The "proportional scrutiny" principle from the methodology played out naturally.** The Scrutiny Gradient says: epic gets the most scrutiny, tech design gets detailed review, stories get "key things + shape." That's exactly what happened — not because I planned it that way, but because the artifact's complexity naturally demanded less verification work. The orchestrator doesn't need to decide how much verification to apply; the artifact's nature guides it. But the orchestrator does need to know when the verification is proportional and when it's not — if story sharding had produced something messy, the light-touch approach wouldn't have been enough.

**One thing I did right this time that I screwed up during tech design validation:** I assessed the Codex findings myself and made the fix/push-back calls without asking the human. Sent four fixes to the story-sharder, pushed back on three findings. The human didn't need to see any of it. That's the operating mode we established — handle the routine, escalate the exceptional. Nothing in this round was exceptional.

**Another thing worth noting:** the story-sharder existed on the same team as the consolidator (td-consolidation). This wasn't deliberate architecture — I just added it to the existing team. But it worked fine. The team is a coordination namespace, not a tight coupling. The two agents never interacted; they just shared a task list. Whether this is the right pattern or whether each phase should have its own team is an open question for when we build the skill.
