# Story 7: Compacted Session Calibration (Deferred)

> **DEFERRED — excluded from story tech enrichment.** Blocked on sample compacted session data. Initial presets match ccs-cloner values and are functional. This story will be scoped and enriched when sample data is available.

## Objective

After this story ships, the preset values are calibrated for compacted sessions based on real-world sample data. The tool may gain a percentage-based stripping mode as an alternative to absolute turn counts.

## Scope

### In Scope

- Collect sample compacted Codex sessions
- Analyze tool-bearing turn distribution in compacted vs. fresh sessions
- Tune preset values based on analysis
- Potentially implement percentage-based stripping mode

### Out of Scope

- All prior functionality (stable from Stories 0-6)

## Dependencies / Prerequisites

- Story 5 must be complete (working clone pipeline to test against)
- Sample compacted session data must be available

## Status

**Deferred.** This story is blocked on sample data availability. Initial presets match ccs-cloner values and are functional. Calibration is a tuning exercise, not a functional gap.

## Acceptance Criteria

No formal ACs or TCs defined. Acceptance will be based on:
- Compacted session clones produce reasonable context reduction
- Preset values documented with rationale
- No regressions in fresh session behavior

## Definition of Done

- [ ] Sample compacted sessions collected and analyzed
- [ ] Preset values updated if analysis warrants changes
- [ ] Before/after statistics documented
- [ ] All existing tests still pass
- [ ] PO accepts
