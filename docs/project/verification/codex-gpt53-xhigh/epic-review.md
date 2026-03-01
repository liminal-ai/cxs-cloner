# Epic Verification Report: cxs-cloner (01-codex-session-cloner)

**Reviewer:** GPT-5.3-Codex (reasoning: extra-high)
**Date:** 2026-02-28
**Mode:** Full epic-level code review

## Scope Reviewed
- Spec: [epic.md](../../epics/01-codex-session-cloner/epic.md)
- Spec: [tech-design.md](../../epics/01-codex-session-cloner/tech-design.md)
- Source: every file under `src/`
- Tests: every file under `test/` (including fixtures)
- Test execution: not rerun (per instruction; 141 pass already verified)

## Overall Assessment
- **Grade: B-**
- **Ship readiness: Not yet ship-ready** for broad use as specified.
- Core architecture and algorithm are strong, but there are meaningful compliance and runtime-risk gaps.

## Findings (ordered by severity)

### 1. [P1] Runtime compatibility risk vs stated Node 18+ assumption
- Evidence:
  - Recursive readdir and `Dirent.parentPath` dependency: [session-directory-scanner.ts:62](../../../src/io/session-directory-scanner.ts#L62), [session-directory-scanner.ts:84](../../../src/io/session-directory-scanner.ts#L84)
- Why this matters:
  - Epic/tech-design assume Node 18+ support. This scanner implementation relies on newer fs behavior and `parentPath`, which is not reliable on Node 18 environments.
- Impact:
  - Session discovery can fail or produce wrong paths in some runtimes.
- Recommendation:
  - Replace recursive `readdir`/`parentPath` usage with explicit directory traversal and fully constructed paths.

### 2. [P2] AC-8.5.1 partially unmet in default human output
- Evidence:
  - Removal-by-type details shown only when `verbose` is true: [clone-result-formatter.ts:49](../../../src/output/clone-result-formatter.ts#L49)
- Why this matters:
  - AC-8.5.1 requires clone output to include removal counts by type. Current default output omits these unless `--verbose`.
- Recommendation:
  - Always include required statistics in standard human output; keep extra diagnostics behind `--verbose`.

### 3. [P2] `info` command default output under-reports record breakdown
- Evidence:
  - Record-type counts are behind `--verbose`: [info-command.ts:91](../../../src/commands/info-command.ts#L91)
- Why this matters:
  - UF-2 and AC-2 emphasize record counts by type; default `info` output currently does not present them.
- Recommendation:
  - Include key per-type counts in default output; use `--verbose` only for extended detail.

### 4. [P2] Layered config is not applied consistently across commands
- Evidence:
  - `clone` uses config loader: [clone-command.ts:80](../../../src/commands/clone-command.ts#L80)
  - `list` and `info` bypass config loader and use hardcoded homedir default: [list-command.ts:36](../../../src/commands/list-command.ts#L36), [info-command.ts:39](../../../src/commands/info-command.ts#L39)
- Why this matters:
  - AC-9.1 describes layered configuration behavior for the system; behavior is currently command-inconsistent.
- Recommendation:
  - Centralize config resolution and use it for all commands.

### 5. [P3] Session-not-found candidate suggestions are not implemented
- Evidence:
  - No candidate generation on not-found path: [session-directory-scanner.ts:127](../../../src/io/session-directory-scanner.ts#L127)
- Why this matters:
  - Epic error-path text expects suggestions for not-found cases.
- Recommendation:
  - Add fuzzy/prefix-near-match candidate generation and include in `SessionNotFoundError`.

### 6. [P3] "Zero tool calls" warning path not implemented
- Evidence:
  - Executor pipeline has no explicit no-tool warning branch: [clone-operation-executor.ts:22](../../../src/core/clone-operation-executor.ts#L22)
- Why this matters:
  - Epic error path says clone should proceed with warning when no tool calls are present.
- Recommendation:
  - Detect zero tool-bearing turns post-identification and surface warning in output.

## Architecture Compliance
- **Compliant overall** with planned module boundaries and flow:
  - Scanner/reader/writer modules exist and align.
  - Turn identification and record stripping are separated cleanly.
  - Executor orchestrates read → identify → strip → write as designed.
- Strong evidence:
  - Pipeline orchestration: [clone-operation-executor.ts:22](../../../src/core/clone-operation-executor.ts#L22)
  - Turn calc isolation: [turn-boundary-calculator.ts:29](../../../src/core/turn-boundary-calculator.ts#L29)
  - Stripping core isolation: [record-stripper.ts:37](../../../src/core/record-stripper.ts#L37)
- Deviations:
  - Config plumbing is not fully cross-command (see P2 #4).
  - `configured-logger` exists but is effectively unused by command flow: [configured-logger.ts:22](../../../src/output/configured-logger.ts#L22)

## AC/TC Coverage Summary
- **Substantial coverage present** across parsing, turning, stripping, and executor integration.
- **Most ACs implemented** in code and represented in tests.
- Notable coverage strengths:
  - Tool pairing/truncation/zone model and compaction handling are well tested: [record-stripper.test.ts:89](../../../test/core/record-stripper.test.ts#L89)
  - Turn boundaries and compaction-edge behavior are tested deeply: [turn-boundary-calculator.test.ts:25](../../../test/core/turn-boundary-calculator.test.ts#L25)
  - JSON parsing strict vs non-strict behavior is tested: [session-file-reader.test.ts:662](../../../test/io/session-file-reader.test.ts#L662)
- Coverage gaps:
  - Command-level behavior is lightly tested (especially list/info command output semantics).
  - Manual TC-8.3.1 remains manual as expected.
  - Some requirement interpretations only validated indirectly (AC-8.5 default human output, AC-2 default info verbosity).

## Code Quality Review
- Strengths:
  - Clean module decomposition and naming.
  - Good type surface and export barrels: [types/index.ts:1](../../../src/types/index.ts#L1), [index.ts:2](../../../src/index.ts#L2)
  - Error taxonomy is coherent and useful: [clone-operation-errors.ts:9](../../../src/errors/clone-operation-errors.ts#L9)
  - Immutability intent in stripper is explicit (`structuredClone`): [record-stripper.ts:44](../../../src/core/record-stripper.ts#L44)
- Concerns:
  - Memory behavior: parser reads full file into memory (`readAllLines`) before parsing: [session-file-reader.ts:206](../../../src/io/session-file-reader.ts#L206)
  - Metadata extraction hard cap at 50 lines can miss first-user fallback in unusual files: [session-file-reader.ts:26](../../../src/io/session-file-reader.ts#L26), [session-file-reader.ts:105](../../../src/io/session-file-reader.ts#L105)

## Testing Quality Review
- Strengths:
  - Excellent depth in core algorithm tests.
  - Good fixture strategy (`SessionBuilder` + static fixtures).
  - Integration pipeline test validates key clone invariants.
- Gaps:
  - Missing robust command-level tests for `list`, `info`, and `clone` CLI output/UX contracts.
  - Unknown-type "debug log emitted" TC is effectively validated for preservation but not log assertion specificity.
  - No explicit test for zero-tool warning behavior (because feature is absent).

## Cross-Cutting Concerns
- Immutability:
  - Positive in stripper via deep clone and test guard: [record-stripper.ts:44](../../../src/core/record-stripper.ts#L44), [record-stripper.test.ts:896](../../../test/core/record-stripper.test.ts#L896)
- Error messages:
  - Generally clear and actionable.
- Type contracts:
  - Strong and forward-compatible in many payloads; good use of unions/interfaces.
- Barrel exports:
  - Solid for many SDK primitives, but practical public API ergonomics could be improved for metadata/info helpers.

## Integration Seams
- Config → stripper seam:
  - Works for `clone` via `buildStripConfig` into executor/stripper pipeline: [clone-command.ts:85](../../../src/commands/clone-command.ts#L85)
  - Event preserve-list merge is correctly deduped: [clone-command.ts:161](../../../src/commands/clone-command.ts#L161)
- Scanner → reader → executor seam:
  - Orchestration flow is clean and consistent: [clone-operation-executor.ts:23](../../../src/core/clone-operation-executor.ts#L23)
  - Risk remains on scanner portability/path construction (P1).

## Production Risks / Technical Debt
- Runtime portability risk (Node version/file API assumptions).
- Requirement interpretation drift in default human outputs (`info`, `clone`).
- Config behavior inconsistency across commands.
- Parser memory model may become problematic with large sessions.
- User-facing error-path polish incomplete (suggestions, no-tool warning).

## Final Recommendation
- **Do not mark ship-ready yet.**
- Minimum pre-ship fixes:
  1. Fix scanner traversal/path strategy for Node 18+ compatibility.
  2. Align default `clone` and `info` outputs with AC-required stats visibility.
  3. Unify layered configuration usage across all commands.
  4. Implement/emit zero-tool warning and session-not-found suggestions.
