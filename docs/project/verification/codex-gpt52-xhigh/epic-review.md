# Epic Verification Report — Codex Session Cloner (`cxs-cloner`)

Reviewer: `codex-gpt52-xhigh`
Date: 2026-03-01
Scope reviewed (per request): `docs/project/epics/01-codex-session-cloner/epic.md`, `docs/project/epics/01-codex-session-cloner/tech-design.md`, **every** file in `src/`, **every** file in `test/` (tests not re-run; reported as 141 passing).

## Executive Summary

Overall assessment: **Mostly ship-ready, with a few correctness/UX gaps and one notable spec gap in clone compaction statistics.**
Grade: **B+** (would be **A-** after addressing the "must-fix" items below).

**Must-fix before shipping (recommended):**
1. **Clone compaction detection/statistics ignores `response_item.type="compaction"`** (AC-10.1/10.2 intent). `src/core/record-stripper.ts:165`, `src/core/record-stripper.ts:269`.
2. **Runtime compatibility risk vs. declared Node engine**: scanner uses `fs.promises.readdir({ recursive: true })` and `Dirent.parentPath`, which are not reliably available in Node 18. `src/io/session-directory-scanner.ts:62`, `src/io/session-directory-scanner.ts:84`; `package.json:37`.

**Should-fix (quality/UX):**
- `list` output doesn't include `cwd` by default despite UF expectations; it is only shown under `--verbose`. `src/commands/list-command.ts:84`.
- "Session not found → suggestions" is described in the epic error paths, but the implementation never supplies candidate IDs. `src/errors/clone-operation-errors.ts:17`, `src/io/session-directory-scanner.ts:127`.
- "Session has zero tool calls → warning emitted" is described in the epic error paths, but no warning is emitted in clone execution (no code path emits it).

## Architecture Compliance (Tech Design ↔ Implementation)

### Module structure and boundaries
**Matches tech design directory/module boundaries** closely:
- CLI entry + arg normalization: `src/cli.ts:7`, `src/cli/normalize-args.ts:18`.
- Commands: `src/commands/main-command.ts:6`, `src/commands/clone-command.ts:21`, `src/commands/list-command.ts:10`, `src/commands/info-command.ts:12`.
- Config: `src/config/configuration-loader.ts:35`, `src/config/configuration-schema.ts:11`, `src/config/default-configuration.ts:14`, `src/config/tool-removal-presets.ts:6`.
- Core pipeline: `src/core/clone-operation-executor.ts:19`, `src/core/turn-boundary-calculator.ts:29`, `src/core/record-stripper.ts:37`.
- IO: `src/io/session-directory-scanner.ts:40`, `src/io/session-file-reader.ts:95`, `src/io/session-file-writer.ts:44`.
- Types + errors: `src/types/codex-session-types.ts:2`, `src/types/clone-operation-types.ts:23`, `src/errors/clone-operation-errors.ts:9`.

### Flow compliance (scanner → reader → executor)
The implemented dataflow matches the tech design's component diagram:
- `clone`: `src/commands/clone-command.ts:103` → `src/core/clone-operation-executor.ts:23` → `src/io/session-directory-scanner.ts:113` → `src/io/session-file-reader.ts:235` → `src/core/turn-boundary-calculator.ts:29` → `src/core/record-stripper.ts:37` → `src/io/session-file-writer.ts:44`.
- `info`: `src/commands/info-command.ts:44` uses `src/io/session-directory-scanner.ts:113`, `src/io/session-file-reader.ts:235`, `src/io/session-file-reader.ts:299`.
- `list`: `src/commands/list-command.ts:47` uses `src/io/session-directory-scanner.ts:40` + `src/io/session-file-reader.ts:95`.

### Interfaces and contracts
Type shapes align with the tech design's low-altitude definitions:
- JSONL envelope + subtypes: `src/types/codex-session-types.ts:2`.
- Core operation types: `src/types/clone-operation-types.ts:23`.
- Stripping config: `src/types/tool-removal-types.ts:8`.

### Notable architecture deviations from tech design
1. **Formatter scope mismatch**: Tech design implies formatter functions for list/info; implementation prints directly in commands. There is only `formatCloneResult`. `src/output/clone-result-formatter.ts:8`, `src/commands/list-command.ts:72`, `src/commands/info-command.ts:66`.
2. **Configured logger is unused**: `src/output/configured-logger.ts:22` is exported (`src/index.ts:98`) but never used in CLI flows.
3. **`preTurnRange` is passed but unused in stripping**: `src/core/record-stripper.ts:40` (named `_preTurnRange`).

## Acceptance Criteria (AC) and Test Conditions (TC) Coverage

### AC-1 (Session discovery)
Implemented:
- Recursive scan + recency sort: `src/io/session-directory-scanner.ts:40`, `src/io/session-directory-scanner.ts:95`.
- `--limit` supported at scanner: `src/io/session-directory-scanner.ts:99`.
- Metadata extraction + first user message fallback to `event_msg`: `src/io/session-file-reader.ts:95`, `src/io/session-file-reader.ts:141`.

Coverage:
- Scanner TCs: `test/io/session-directory-scanner.test.ts:50` (TC-1.1.1), `test/io/session-directory-scanner.test.ts:71` (TC-1.1.2), `test/io/session-directory-scanner.test.ts:97` (TC-1.1.3), `test/io/session-directory-scanner.test.ts:103` (TC-1.2.1), `test/io/session-directory-scanner.test.ts:122` (TC-1.4.1), `test/io/session-directory-scanner.test.ts:154` (TC-1.5.1).
- Reader metadata TCs: `test/io/session-file-reader.test.ts:43` (TC-1.2.2), `test/io/session-file-reader.test.ts:76` (TC-1.3.1), `test/io/session-file-reader.test.ts:126` (TC-1.3.2).

Gaps/notes:
- UF expectation says list output should show working directory; implementation shows `cwd` only under `--verbose`. `src/commands/list-command.ts:84`.
- AC-1.2 expects filename + `session_meta` metadata; list currently **prints date from `session_meta.timestamp`**, not from filename-derived createdAt returned by scanner. `src/commands/list-command.ts:75`.

### AC-2 (Session info)
Implemented:
- Partial UUID lookup + ambiguity errors: `src/io/session-directory-scanner.ts:113`.
- Full parse + stats + compaction positions: `src/io/session-file-reader.ts:235`, `src/io/session-file-reader.ts:326`.
- CLI output: `src/commands/info-command.ts:77`.

Coverage:
- Lookup: `test/io/session-directory-scanner.test.ts:234` (TC-2.5.1), `test/io/session-directory-scanner.test.ts:249` (TC-2.5.2).
- Reader/stats: `test/io/session-file-reader.test.ts:245` (TC-2.1.1), `test/io/session-file-reader.test.ts:262` (TC-2.1.2), `test/io/session-file-reader.test.ts:279` (TC-2.1.3), `test/io/session-file-reader.test.ts:305` (TC-2.2.1), `test/io/session-file-reader.test.ts:330` (TC-2.2.2), `test/io/session-file-reader.test.ts:345` (TC-2.3.1), `test/io/session-file-reader.test.ts:362` (TC-2.4.1).

### AC-3 (JSONL parsing)
Implemented:
- Strict vs non-strict malformed handling: `src/io/session-file-reader.ts:239`.
- Unknown record/subtype passthrough with debug log: `src/io/session-file-reader.ts:263`, `src/io/session-file-reader.ts:273`.

Coverage:
- Malformed strict/non-strict: `test/io/session-file-reader.test.ts:662` (TC-3.3.2), `test/io/session-file-reader.test.ts:703` (TC-3.3.3), `test/io/session-file-reader.test.ts:177` (TC-3.3.1).
- Known types: `test/io/session-file-reader.test.ts:403` (TC-3.1.1), `test/io/session-file-reader.test.ts:427` (TC-3.1.2), `test/io/session-file-reader.test.ts:467` (TC-3.1.3), `test/io/session-file-reader.test.ts:506` (TC-3.1.4), `test/io/session-file-reader.test.ts:541` (TC-3.2.1).

Quality note:
- `parseSessionFile` reads the entire file into memory (`readAllLines`). `src/io/session-file-reader.ts:206`. This combines with `structuredClone` in stripping (see Risks).

### AC-4 (Turn boundary identification)
Implemented:
- Turn_context boundaries with compaction awareness: `src/core/turn-boundary-calculator.ts:29`, `src/core/turn-boundary-calculator.ts:44`.
- Tool-bearing classification checks only "call" subtypes (not outputs): `src/core/turn-boundary-calculator.ts:8`, `src/core/turn-boundary-calculator.ts:101`.

Coverage:
- `identifyTurns`: `test/core/turn-boundary-calculator.test.ts:28` (TC-4.1.1), `test/core/turn-boundary-calculator.test.ts:154` (TC-4.1.2), plus TC-4.2.1/4.3.1/4.3.2/4.4.1/4.4.2/4.4.3 in the same file.

Potential edge-case gap:
- A turn containing only `function_call_output` (without a `function_call`) would not be classified tool-bearing. Likely fine, but it's an implicit format assumption.

### AC-5/6/7/10.1/10.3 (Record stripping algorithm)
Implemented:
- Zone computation based on **tool-bearing turns only**: `src/core/record-stripper.ts:281`.
- Removed-zone tool removal + paired outputs: `src/core/record-stripper.ts:70`, `src/core/record-stripper.ts:100`.
- Truncation: `src/core/record-stripper.ts:132`, `src/core/record-stripper.ts:356`.
- Reasoning stripping modes (and compaction exception): `src/core/record-stripper.ts:155`, `src/core/record-stripper.ts:165`.
- Telemetry stripping, turn_context stripping by zone, ghost removal: `src/core/record-stripper.ts:183`, `src/core/record-stripper.ts:200`, `src/core/record-stripper.ts:213`.
- Empty-turn removal: `src/core/record-stripper.ts:416`.

Coverage:
- Comprehensive TC coverage exists in `test/core/record-stripper.test.ts:92` onward.

Important behavioral nuance (potential spec interpretation risk):
- Empty-turn removal defines "conversational content" as presence of `response_item.type="message"` only. `src/core/record-stripper.ts:440`.
  - If a removed-zone turn contained a preserved `event_msg.type="user_message"` but no response_item message (a format allowed by AC-1.3 fallback), that event could be removed as "empty turn" content. Not covered by tests (most fixtures use `SessionBuilder`, which always includes response_item messages: `test/fixtures/builders/session-builder.ts:93`).

### AC-8 (Clone output)
Implemented:
- Executor pipeline + session_meta update: `src/core/clone-operation-executor.ts:19`, `src/core/clone-operation-executor.ts:87`.
- Writer naming + atomic write: `src/io/session-file-writer.ts:44`.
- Formatting + resume gating: `src/output/clone-result-formatter.ts:69`.

Coverage:
- Executor integration: `test/integration/clone-operation-executor.test.ts:108` (TC-8.1.1), `test/integration/clone-operation-executor.test.ts:129` (TC-8.1.2), `test/integration/clone-operation-executor.test.ts:151` (TC-8.3.2), `test/integration/clone-operation-executor.test.ts:172` (TC-8.3.3), `test/integration/clone-operation-executor.test.ts:196` (TC-8.4.1), `test/integration/clone-operation-executor.test.ts:217` (TC-8.4.2), `test/integration/clone-operation-executor.test.ts:251` (TC-8.4.3), `test/integration/clone-operation-executor.test.ts:272` (TC-8.5.1), `test/integration/clone-operation-executor.test.ts:314` (TC-10.2.1).
- Writer: `test/io/session-file-writer.test.ts:38` (TC-8.2.1), `test/io/session-file-writer.test.ts:69` (TC-8.2.2), `test/io/session-file-writer.test.ts:90` (reinforces TC-8.3.3).
- Formatter JSON output: `test/output/clone-result-formatter.test.ts:34` (TC-8.5.2).

Manual-only TC:
- **TC-8.3.1** (`codex resume <newId>` discovers clone) is manual-only and not automated (confirmed by TC label scan).

### AC-9 (Configuration)
Implemented:
- Layering defaults → file → env → overrides: `src/config/configuration-loader.ts:35`.
- Env mapping: `src/config/default-configuration.ts:23`.
- Clone command usage: `src/commands/clone-command.ts:80`, `src/commands/clone-command.ts:130`.

Coverage:
- `test/config/configuration-loader.test.ts:39` (TC-9.1.1), `test/config/configuration-loader.test.ts:47` (TC-9.1.2).
- Presets: `test/config/tool-removal-presets.test.ts:26` (TC-9.2.1), `test/config/tool-removal-presets.test.ts:34` (TC-9.2.2).
- Preserve list override: `test/core/record-stripper.test.ts:664` (TC-9.3.1).

## Code Quality Review

### Strengths
- **Clear, testable module separation**; each stage is isolated and unit-tested.
- **Stripping is pure-by-default**: `stripRecords` deep-clones input (`src/core/record-stripper.ts:44`) and has an immutability test (`test/core/record-stripper.test.ts:898`).
- **Config loader layering is correct and defensive** (`src/config/configuration-loader.ts:79`).
- **Writer atomicity + cleanup** is implemented and tested (`src/io/session-file-writer.ts:70`, `test/io/session-file-writer.test.ts:111`).

### Issues / improvement opportunities
1. **Node 18 compatibility mismatch**: likely to break when installed as a Node CLI due to recursive `readdir` usage. `src/io/session-directory-scanner.ts:62`, `package.json:37`.
2. **Clone compaction statistics are incomplete**: `compactionDetected`/`compactedRecordCount` ignore `response_item` subtype `compaction`. `src/core/record-stripper.ts:165`, `src/core/record-stripper.ts:269`.
3. **Memory amplification in clone**:
   - Parse reads all lines: `src/io/session-file-reader.ts:206`.
   - Strip deep-clones records: `src/core/record-stripper.ts:44`.
4. **UX drift vs UF expectations**:
   - `list` omits `cwd` in the primary line. `src/commands/list-command.ts:82`.
   - `clone` does not emit the "zero tools" warning described in epic error paths.
5. **Error-path completeness**:
   - "Session not found → suggestions" not implemented (candidates never computed/passed). `src/io/session-directory-scanner.ts:127`.
6. **Dead/unused surface area**:
   - `src/output/configured-logger.ts:22` is unused.

## Testing Quality Review

### What's strong
- All epic TCs are covered by automated tests **except** manual **TC-8.3.1**.
- Tests are behavior-focused (record presence/absence and stats).
- Integration tests validate the full clone pipeline including identity updates and JSON validity. `test/integration/clone-operation-executor.test.ts:106`.

### Gaps / blind spots
- No tests for CLI command wiring/printing (citty parsing end-to-end).
- No test asserting user-facing warnings (custom output warning, "no tools" warning).
- No test covering "event_msg-only user content in removed-zone turns" edge case.
- No test for clone compaction stats when **only** `response_item.type="compaction"` exists (no top-level `compacted`), which is exactly where current implementation under-reports compaction.

## Cross-Cutting Concerns

- **Immutability**:
  - `stripRecords` deep-clones and mutates only clone (`src/core/record-stripper.ts:44`).
  - `executeCloneOperation` intentionally mutates cloned `session_meta` payload (`src/core/clone-operation-executor.ts:95`).
- **Error messages / type contracts**:
  - Custom error types are consistent (`src/errors/clone-operation-errors.ts:9`).
  - JSON parsing uses casts rather than runtime validation; acceptable for a cloner but should be considered a trust boundary.
- **Barrel exports**:
  - `src/index.ts:102` exports `validateStrippingFlags` (CLI-ish helper) as part of SDK surface; consider whether that's intentional.

## Integration Seams (How modules compose)

- **Config → Stripper**: clone command merges preserve-list defaults with config overrides (`src/commands/clone-command.ts:162`) then passes into executor (`src/core/clone-operation-executor.ts:41`).
- **Scanner → Reader → Executor**: `findSessionByPartialId` relies on scanner's recursive walk (`src/io/session-directory-scanner.ts:61`) and filename parsing (`src/io/session-directory-scanner.ts:15`); this seam is operationally risky given Node 18 compatibility concerns.

## Risks and Technical Debt

1. **Operational compatibility risk (Node 18)**: likely breakage when installed as a Node CLI (`package.json:37` vs scanner implementation).
2. **Large-session performance/memory**: parsing + deep cloning is expensive; streaming parse/write may be needed.
3. **Compaction reporting correctness**: clone stats under-report compaction in `response_item`-only compaction sessions.
4. **Spec/UX drift**: list output formatting and missing warnings could confuse users even if core stripping works.

## Ship Readiness

Ship-ready: **Conditional**.

Recommended ship gate:
- Fix compaction statistics detection to include `response_item.type="compaction"`.
- Decide/clarify runtime target:
  - If **Bun-only**, update `package.json:37` and/or docs accordingly.
  - If **Node 18+**, replace recursive `readdir` + `parentPath` usage with a portable directory walk.

If those are addressed: grade becomes **A-** and the epic looks solid for real-world usage (pending manual TC-8.3.1 validation on a real Codex session).
