# Multi-Perspective Review

Protocol for running parallel reviews across multiple models and synthesizing findings.

## The Pattern

Launch multiple reviewers in parallel, each reading the same artifacts and reviewing the same work independently. When all reports are in, cross-reference findings to separate signal from noise.

Convergence is the signal. When independent reviewers flag the same issue, it's real. When only one reviewer flags something, investigate — it could be noise or it could be the most valuable finding.

## Cross-Referencing

After collecting all reviews, build a cross-reference:
- Findings flagged by multiple reviewers: high confidence, route for fix
- Findings unique to one reviewer: investigate, use judgment
- Severity disagreements between reviewers: focus on "does this need fixing" not the label

## Consolidation and Fix Routing

The agent who found issues can also fix them — they already have the context. After fixes, a fresh reviewer (different model/instance) confirms the fixes are correct.

## Iterated Self-Review

When an agent implements fixes or builds something new, ask for a critical self-review. If the self-review produces substantive changes, ask for another round. Continue until the agent comes back with no substantive changes — clean or nits only. The loop converges when there's nothing left worth fixing.

## Severity Calibration

Different models calibrate severity differently. The orchestrator applies their own judgment rather than averaging or deferring to any single model's assessment.

## The Meta-Report Pattern

For comprehensive reviews (epic-level verification), each reviewer reads all other reviews and writes a meta-report: rank the reports, describe strengths and weaknesses of each, and describe what they would synthesize from the full set. Models are surprisingly honest about their own weaknesses when they can compare against others.
