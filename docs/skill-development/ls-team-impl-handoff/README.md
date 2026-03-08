# ls-team-impl Skill Handoff

Draft materials for a new Liminal Spec skill: **ls-team-impl** (Team Implementation Orchestration). This skill is for the team lead / orchestrator role — the agent that spawns and manages teammates, routes verification, and makes judgment calls across a story-by-story implementation cycle.

## Status

The implementation orchestration skill (`ls-team-impl`) has been drafted. The spec orchestration skill (`ls-team-spec`) has not yet been drafted — the learning log for it exists but hasn't been synthesized into a skill draft.

## Files

### `team-impl.md`

The proposed phase source file for `src/phases/team-impl.md` in the liminal-spec build system. This is the primary skill content — everything the orchestrator needs to manage team-based implementation.

Covers:
- On Load — skill dependencies, artifact discovery
- Team Setup — lifecycle, agent configuration
- Story Implementation Cycle — implementer handoff, verification, orchestrator final check, story transition, escalation
- Epic-Level Verification — four-model parallel review with meta-reports
- Operational Patterns — idle notifications, context ceilings, forgot-to-report, sequencing, process adaptation
- Logging — what to capture and how

When built into a final SKILL.md, the build system will append shared dependencies declared in `manifest.json`. The existing shared files that would likely be composed into this skill:

| Shared File | Why |
|-------------|-----|
| `confidence-chain.md` | AC → TC → Test → Impl traceability — the orchestrator needs this to verify coverage |
| `verification-model.md` | Scrutiny gradient and multi-agent validation patterns — the orchestrator applies these |

The phase file is self-contained as drafted — it doesn't depend on the shared files being appended to function. The shared files would provide additional reference context that reinforces concepts already present in the phase content.

### `proposed-shared/`

Three files that could be candidates for `src/shared/` in the liminal-spec build system. These extract cross-cutting patterns from the phase file that a future `ls-team-spec` skill would also need. They are presented separately for consideration — the phase file (`team-impl.md`) contains all of this content inline and does not reference these files. Nothing has been pulled out of the phase file.

| File | Content | Shared Between |
|------|---------|---------------|
| `team-lifecycle.md` | Spawning, shutdown, idle notifications, context ceilings, forgot-to-report, sequencing | ls-team-impl, ls-team-spec |
| `multi-perspective-review.md` | Parallel reviews, cross-referencing, consolidation, iterated self-review, severity calibration, meta-reports | ls-team-impl, ls-team-spec |
| `codex-integration.md` | Skill dependencies, prompting patterns, async launch, read-only mode, model selection | ls-team-impl, ls-team-spec |

The decision on whether to extract these to shared should wait until the second skill (`ls-team-spec`) is drafted and the actual overlap is confirmed. The liminal-spec project principle is: don't extract to shared until the same content appears in two places.

### `logs/`

Two learning logs from the cxs-cloner project that produced these skill drafts. The logs capture the full orchestration experience — decisions, corrections, failure modes, process evolution — from building a real feature with agent teams.

| File | Scope | Entries |
|------|-------|---------|
| `team-orchestrated-spec.md` | Spec creation phases: epic validation → tech design validation → story sharding. Covers orchestrator autonomy, validation patterns, consolidation dynamics, context management, proportional scrutiny. | 21 entries, 466 lines |
| `team-orchestrated-impl.md` | Implementation phase: story-by-story implementation with agent teams. Covers handoff construction, verification patterns, failure modes, process evolution, CLI boundary testing. | 16 entries, 403 lines |

The implementation log (`team-orchestrated-impl.md`) was the primary source for the `team-impl.md` draft. The spec log (`team-orchestrated-spec.md`) has not yet been synthesized into a skill draft — that work would produce a separate `ls-team-spec` skill covering orchestration of the spec pipeline (epic → tech design → stories) with agent teams.

## What's Next

1. Review and finalize `team-impl.md` as the phase source
2. Decide on manifest entry — skill name, description, shared dependencies
3. Add to the liminal-spec build system (`src/phases/`, `manifest.json`, router update)
4. Test with a real epic implementation
5. Draft `ls-team-spec` from the spec orchestration log
6. After both skills exist, evaluate whether proposed-shared files should be extracted to `src/shared/`
