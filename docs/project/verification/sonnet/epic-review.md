# Epic Review: Codex Session Cloner (cxs-cloner)

**Reviewer:** Claude Sonnet 4.6
**Date:** 2026-02-28
**Scope:** Full epic verification against implementation
**Test status at review:** 141 pass, 0 fail

---

## 1. Architecture Compliance

### Module Structure

The implementation matches the tech design spec exactly. Every module in the prescribed layout exists:

```
src/
  cli.ts                              ✅
  index.ts                            ✅
  cli/normalize-args.ts               ✅
  commands/{main,clone,list,info}-command.ts  ✅
  config/{configuration-loader,schema,default,tool-removal-presets}.ts  ✅
  core/{clone-operation-executor,record-stripper,turn-boundary-calculator}.ts  ✅
  errors/clone-operation-errors.ts    ✅
  io/{session-directory-scanner,session-file-reader,session-file-writer}.ts  ✅
  output/{clone-result-formatter,configured-logger}.ts  ✅
  types/{index,codex-session-types,clone-operation-types,tool-removal-types,configuration-types}.ts  ✅
```

The test tree mirrors src/ exactly with fixtures cleanly separated.

### Pipeline Flow

The runtime flow follows the sequence diagram precisely:

```
normalize-args → citty (clone-command) → loadConfiguration → executeCloneOperation
    → findSessionByPartialId → parseSessionFile → identifyTurns → stripRecords
    → writeClonedSession → formatCloneResult
```

No deviations from the prescribed architecture. The executor acts as a pure orchestrator — it contains no stripping logic, delegating entirely to `turn-boundary-calculator` and `record-stripper` as designed.

### Dependency Direction

Clean. The direction flows: commands → core → io → types, with no upward dependencies. Config flows in from the command layer, not from within core.

---

## 2. AC/TC Coverage

### AC-1: Session Discovery — COMPLETE ✅

All TCs covered and tested in `session-directory-scanner.test.ts` and `session-file-reader.test.ts`.

- **TC-1.1.1/1.1.2/1.1.3**: Directory scanning, sort order, empty dir — all tested with real temp dirs.
- **TC-1.2.1**: Filename regex parsing (`SESSION_FILENAME_REGEX`) tested. Timestamp conversion (dashes to colons) correctly implemented.
- **TC-1.2.2**: session_meta fields accessible — tested.
- **TC-1.3.1/1.3.2**: First user message extraction (response_item primary, event_msg fallback) — tested with exact 80-char truncation boundary.
- **TC-1.4.1**: Limit applied after sort — tested against 50 sessions.
- **TC-1.5.1**: `--codex-dir` override — tested with separate temp dir structure.

### AC-2: Session Info — COMPLETE ✅

All TCs covered in `session-file-reader.test.ts`.

- **TC-2.1.1/2.1.2/2.1.3**: Record counts accurate. `computeSessionStatistics` correctly counts all subtypes.
- **TC-2.2.1/2.2.2**: Compacted record positions (1-indexed line numbers) — tested with explicit position assertions.
- **TC-2.3.1**: Turn count via `turn_context` records — tested.
- **TC-2.4.1**: File size reporting and `Math.floor(bytes/4)` token estimate — tested with a padded ~100KB file.
- **TC-2.5.1/2.5.2**: Partial UUID matching, `AmbiguousMatchError` with full match list — tested.

### AC-3: JSONL Parsing — COMPLETE ✅

All TCs covered.

- **TC-3.1.1–3.1.4**: All record type fields accessible. Unknown types preserved as-is with `consola.debug` — tested by verifying record count and type field on unknown records.
- **TC-3.2.1**: All 10 response_item subtypes discriminated — tested in a single file with one of each.
- **TC-3.3.1**: Non-strict skips malformed lines — tested.
- **TC-3.3.2**: Strict throws `MalformedJsonError` with correct line number and path — tested.
- **TC-3.3.3**: Non-strict (force mode proxy) skips malformed lines — tested separately.

### AC-4: Turn Boundary Identification — COMPLETE ✅

All TCs covered in `turn-boundary-calculator.test.ts`.

- **TC-4.1.1**: Turn_context positions at indices 5, 20, 40 verified with exact boundary values and `preTurnRecords.endIndex === 5`.
- **TC-4.1.2**: event_msg between turn_contexts does NOT redefine boundaries — tested.
- **TC-4.2.1**: Pre-turn records (before first qualifying turn_context) preserved, not in any turn — tested.
- **TC-4.3.1**: Only post-compaction turn_context records are turns — tested with 9 pre-compaction fillers, compacted at index 10, 5 post-compaction turns.
- **TC-4.3.2**: Mid-turn compaction — turn_context_A ignored, turn_context_B (post-compaction) defines the turn — tested with exact index assertions.
- **TC-4.4.1/4.4.2/4.4.3**: Tool-bearing classification for all 4 tool types — tested. Non-tool turns correctly classified.

Additional non-TC tests add confidence: consecutive turn_contexts (empty turns), 120-turn performance sanity, zone always null on output.

### AC-5: Zone-Based Tool Stripping — COMPLETE ✅

All TCs covered in `record-stripper.test.ts`.

- **TC-5.1.1**: 30 tool turns, default preset → `functionCallsRemoved=10`, `functionCallsTruncated=10` — verified. **Note:** the test does not independently verify that 10 turns are in the preserved zone (i.e., function_calls in preserved zone remain). This is implicitly verified by the count math but is a minor test assertion gap.
- **TC-5.1.2**: 5 tool turns under keep=20 → 0 removed, 0 truncated — tested.
- **TC-5.2.1–5.2.4**: function_call/custom_tool_call paired output removal, standalone local_shell_call and web_search_call removal — all tested.
- **TC-5.3.1**: String output truncated at 120+3 chars — tested.
- **TC-5.3.2**: ContentItem[] array truncation — tested across both input_text and output_text items.
- **TC-5.3.3**: JSON-in-JSON arguments parsing, string value truncation, re-serialization — tested with nested keys.
- **TC-5.4.1/5.4.2/5.4.3**: Preset resolution for default/extreme/heavy — tested.
- **TC-5.5.1**: Tool-only turn in removed zone → entire turn removed (confirmed: turn_context removed by Stage 5b before `findEmptyTurnIndices` runs) — tested.
- **TC-5.5.2**: Mixed tool+message turn in removed zone → tools removed, messages survive — tested.

### AC-6: Reasoning Stripping — COMPLETE ✅

All TCs covered.

- **TC-6.1.0**: No stripping flags → `ArgumentValidationError` with correct message — tested in `normalize-args.test.ts`.
- **TC-6.1.1**: strip-tools implicit reasoning=full — tested.
- **TC-6.1.2**: strip-reasoning=none with strip-tools preserves reasoning — tested.
- **TC-6.1.3**: strip-reasoning=full without strip-tools removes reasoning but preserves tools AND telemetry (exec_command_begin explicitly verified) — tested.
- **TC-6.1.4**: summary-only removes `content` and `encrypted_content`, keeps `summary` — tested with setup that adds both fields.
- **TC-6.2.1/6.2.2**: reasoning response_item removed; compaction response_item preserved — separately tested.

### AC-7: Telemetry and Context Stripping — COMPLETE ✅

All TCs covered.

- **TC-7.1.1**: exec_command_begin/end/output_delta removed — tested.
- **TC-7.1.2/7.1.3**: user_message and error preserved — tested individually.
- **TC-7.1.4**: token_count, agent_reasoning removed — tested.
- **TC-7.2.1/7.2.2**: turn_context removed in removed and truncated zones — tested.
- **TC-7.2.3**: turn_context in preserved zone retains structural fields (turn_id, cwd, model), strips user_instructions/developer_instructions/instructions/collaboration_mode — tested with all four fields set.
- **TC-7.3.1**: ghost_snapshot response_item removed — tested.
- **TC-9.3.1 (here)**: Custom eventPreserveList augments defaults — tested in a dedicated describe block.

### AC-8: Clone Output — COMPLETE ✅

All TCs covered in `clone-operation-executor.test.ts` and `session-file-writer.test.ts`.

- **TC-8.1.1**: Clone UUID differs from source, matches UUID v4 regex — tested.
- **TC-8.1.2**: session_meta.id in output equals clonedThreadId — tested.
- **TC-8.2.1**: Default path follows `sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl` pattern — tested with path substring assertions.
- **TC-8.2.2**: Custom --output path honored, `isDefaultLocation=false` — tested.
- **TC-8.3.1**: Manual/integration test — correctly deferred per spec.
- **TC-8.3.2**: Custom path clone sets `resumable=false` — tested.
- **TC-8.3.3**: Every output line valid JSON — tested in both writer and integration tests.
- **TC-8.4.1/8.4.2/8.4.3**: session_meta id update, original fields preserved, `forked_from_id` set — all tested.
- **TC-8.5.1**: All `CloneStatistics` fields present and correctly typed — tested with type assertions and value sanity checks.
- **TC-8.5.2**: JSON output format — tested.

### AC-9: Configuration — MOSTLY COMPLETE ⚠️

- **TC-9.1.1/9.1.2**: Env var and CLI flag precedence — tested via `loadConfiguration` directly.
- **TC-9.2.1**: Custom preset from config file — tested in `tool-removal-presets.test.ts`.
- **TC-9.2.2**: **Gap.** The test in `tool-removal-presets.test.ts` verifies that `resolvePreset("default", customPresets)` returns custom values when a custom preset overrides the built-in name. But it does NOT test the full flow: config file with `defaultPreset: "aggressive"` → `loadConfiguration` → `buildStripConfig` → stripped with aggressive values. The two halves are tested independently, but the composition through `clone-command.buildStripConfig` is not covered by any test.
- **TC-9.3.1**: Custom eventPreserveList coverage — tested in `record-stripper.test.ts`.

### AC-10: Compacted Session Handling — COMPLETE ✅

All TCs covered, including both top-level `compacted` records and `compaction` response_item subtypes.

- **TC-10.1.1/10.1.2**: Both compaction record types preserved in output — tested.
- **TC-10.2.1**: `compactionDetected: true`, `compactedRecordCount > 0` in statistics — tested in integration.
- **TC-10.3.1**: 15 post-compaction tool turns under keep=20 → 0 removed — tested.
- **TC-10.3.2**: 40 post-compaction tool turns → 20 removed, 10 truncated — tested.

---

## 3. Code Quality

### Strengths

**Type system is rigorous.** No `any` types. Discriminated union types correctly model all 10+ response_item subtypes. The `UnknownResponseItemPayload` with index signature handles forward compatibility. `TURN_CONTEXT_STRUCTURAL_FIELDS as const` and `DEFAULT_EVENT_PRESERVE_LIST as const` are correct uses of const assertions.

**Record stripper is correctly implemented.** The zone computation algorithm is clean and correct. The `computeZones` function counts from the END of tool-bearing turns (newest-first), which is the correct interpretation of "keep last N". The `distFromEnd < preservedCount` boundary is correct.

**Immutability contract honored.** `stripRecords` uses `structuredClone(records)` before mutation, fulfilling the stated contract. The input immutability test verifies this.

**Atomic writes.** `session-file-writer.ts` writes to a temp UUID-named file, stats it (to get real size before rename), then renames. Cleanup on failure works. A dedicated test exercises the cleanup path by creating a directory at the target path to force `EISDIR` on rename.

**Error class hierarchy is clean.** `CxsError` as base class, 7 subclasses with informative messages and typed public fields. `SessionNotFoundError` accepts optional candidates for fuzzy suggestions.

**SessionBuilder test fixture** is well-designed. Fluent API, deterministic timestamps, correct call_id pairing, supports all tool types. Module-level `callIdCounter` is reset in constructor, which works correctly for sequential single-threaded test runs.

### Issues

**Issue 1 — Env var not respected in `list` and `info` commands [P2]**

`list-command.ts:36` and `info-command.ts:39` both construct `codexDir` directly:
```typescript
const codexDir = args["codex-dir"] || join(homedir(), ".codex");
```

Neither calls `loadConfiguration`. This means `CXS_CLONER_CODEX_DIR` env var is silently ignored for these two commands. Only `clone` uses `loadConfiguration`. The AC-9.1 spec says "when the tool runs" — which implies all commands should respect env vars. The tests for AC-9.1 only exercise `loadConfiguration` in isolation, so this gap isn't caught.

**Issue 2 — `turnCountOriginal` statistic inaccuracy for compacted sessions [P3]**

In `record-stripper.ts:261`:
```typescript
turnCountOriginal: cloned.filter((r) => r.type === "turn_context").length,
```

This counts ALL `turn_context` records, including pre-compaction ones. But `identifyTurns` only treats post-compaction `turn_context` records as turns — pre-compaction ones land in the pre-turn range and are always preserved. For a compacted session, `turnCountOriginal` will be inflated by the number of pre-compaction turn_context records. The TC-8.5.1 test uses a non-compacted session (`turnCountOriginal === 3`), so this isn't exposed. Functionally harmless, but misrepresents the stat semantics.

**Issue 3 — `_preTurnRange` is an unused API parameter [P4]**

`record-stripper.ts:42` accepts `_preTurnRange` with the underscore-prefix suppression. The pre-turn range is preserved implicitly (records outside any zone map are untouched). The parameter serves no purpose in the current implementation. It was kept to match the tech design's stub signature, but it's dead code in the function interface.

**Issue 4 — `functionCallsRemoved` stat counts only call initiations, not paired outputs [P4]**

Stage 2 of `record-stripper.ts` calls `functionCallsRemoved++` for each tool call subtype (`function_call`, `local_shell_call`, `custom_tool_call`, `web_search_call`) but NOT for the paired outputs that are also removed. A pair removal of `function_call + function_call_output` increments `functionCallsRemoved` by 1, not 2. This is misleading naming — the stat represents "tool call initiations removed" not "tool-call-related records removed." Functionally harmless since `fileSizeReductionPercent` is the authoritative measure.

**Issue 5 — `formatFileSize` duplicated in list-command and info-command [P4]**

`list-command.ts:108` and `info-command.ts:114` both define identical `formatFileSize` implementations. Minor copy-paste risk.

**Issue 6 — Missing test for sessions directory not existing [P4]**

`scanSessionDirectory` throws `CxsError` with a clear message when `~/.codex/sessions/` doesn't exist. TC-1.1.3 covers the empty directory case, but no test covers the missing directory case. The error message path is untested.

**Issue 7 — TC-5.1.1 doesn't verify preserved zone tool calls remain [P4]**

The test asserts `functionCallsRemoved === 10` and `functionCallsTruncated === 10`, which implies 10 tool-bearing turns are in the preserved zone. But it doesn't independently verify that `countBySubtype(result.records, "function_call") === 10`. The inference is correct, but the assertion is incomplete.

---

## 4. Testing Quality

### Test Architecture

The test structure is excellent. Integration tests in `test/integration/` exercise the full pipeline end-to-end with real temp directories. Unit tests exercise individual modules in isolation. The `SessionBuilder` fixture provides a programmatic, type-safe way to construct test sessions without writing raw JSONL.

The integration tests for `executeCloneOperation` are particularly strong — they write real session files, run the full pipeline, read back the output, and parse it. TC-8.3.3 (every output line is valid JSON) is tested both at the writer level and the integration level.

### Test Quality Observations

**Good:** The TC-4.1.1 test constructs session records with exact index positions (using manual appends after `builder.build()`) to verify turn boundaries at indices 5, 20, 40. This is precise and would catch off-by-one errors.

**Good:** TC-6.1.3 explicitly verifies that `exec_command_begin` events are preserved when only `--strip-reasoning` is active (not `--strip-tools`). This tests the subtle interaction between reasoning-only mode and telemetry non-stripping.

**Good:** TC-4.3.2 (mid-turn compaction) covers an edge case that could easily be wrong. The test uses exact index assertions.

**Gap:** AC-9.2.2 — no end-to-end test for config file `defaultPreset` flowing through `buildStripConfig` to actual preset values used (see AC/TC Coverage section).

**Gap:** `normalizeArgs` behavior with `--strip-tools` followed by a space-separated value (`aggressive`) is tested (the flag passes through unchanged). But there's no test verifying that citty actually parses this as the preset name rather than a positional arg. This is a CLI wire-up gap that would only appear in a full CLI invocation test.

**Gap:** The `clone-command` has no tests at the command level. All command logic is tested through its collaborators, but error handling in the `catch` block (printing error message, `process.exit(1)`) is untested.

---

## 5. Cross-Cutting Concerns

### Immutability

`stripRecords` properly clones input with `structuredClone`. `identifyTurns` returns new objects and doesn't mutate input. `computeZones` uses `turns.map((t) => ({ ...t }))` for shallow copy. The immutability test in `record-stripper.test.ts` verifies no input mutation after stripping.

One subtle note: in Stage 4 (`summary-only` mode), the code does:
```typescript
const rPayload = record.payload as ReasoningPayload;
delete rPayload.content;
delete rPayload.encrypted_content;
```
This mutates `cloned[i].payload` directly. Since `cloned` is the structuredClone output, this is correct — it's mutating the copy, not the original. ✅

### Error Messages

All user-facing error messages are clear and actionable. `SessionNotFoundError` includes the session ID. `AmbiguousMatchError` lists all matching IDs. `MalformedJsonError` includes file path and line number. `ConfigurationError` includes zod error details via `issue.path.join(".")`.

### Type Contracts

The barrel exports in `src/index.ts` are comprehensive and cover all public interfaces. Both type exports and runtime exports (constants, functions) are cleanly separated. The types barrel in `src/types/index.ts` correctly re-exports from all four type files.

`LocalShellCallPayload.call_id` is marked optional (`call_id?: string`) which correctly handles the case in `record-stripper.ts` where `call_id` presence is checked before use. ✅

### Forward Compatibility

Unknown top-level record types are passed through with a debug log. Unknown response_item subtypes are passed through. `TurnContextPayload` has `[key: string]: unknown` index signature. `SessionMetaPayload` has `[key: string]: unknown`. `configurationPartialSchema.passthrough()` accepts unknown config file fields. These are all correct forward-compat decisions.

---

## 6. Integration Seams

### Config → StripConfig flow

`loadConfiguration` → `buildStripConfig` (in `clone-command`) → `executeCloneOperation`. The seam is clean. One note: the built-in `DEFAULT_EVENT_PRESERVE_LIST` is applied twice — once as the default in `DEFAULT_CONFIGURATION.eventPreserveList`, and again in `buildStripConfig` as a union with the config's list. The union ensures the built-in defaults are never suppressible via config, which matches AC-9.3 ("in addition to built-in defaults"). The double-application is intentional but slightly redundant.

### Scanner → Reader → Executor pipeline

`scanSessionDirectory` returns `SessionFileInfo[]` → `findSessionByPartialId` filters to one → `parseSessionFile` reads it into `ParsedSession` → `identifyTurns` processes `records[]` → `stripRecords` takes `turns` and `preTurnRecords` → `writeClonedSession` takes `records[]`. Each module receives only what it needs. No data flows backwards. The executor's `updateSessionMeta` mutates the stripped records array in place before writing — this is intentional and the last mutation before write.

### Compaction boundary across modules

`identifyTurns` detects compaction and returns `lastCompactionIndex`. `stripRecords` takes the turns (already post-compaction only) and applies zones. The compaction itself is never touched by `stripRecords` — it's in the pre-turn range and passes through untouched. `executeCloneOperation` reads `stripResult.statistics.compactionDetected` (which is computed inside `stripRecords` by checking if any `compacted` record exists in the cloned array). This is correct: `compactionDetected` uses the cloned records, which include any compacted records since they weren't removed.

---

## 7. Risks and Technical Debt

**Risk 1: Env var ignored in list/info** [P2 — Ship risk]
Users who configure `CXS_CLONER_CODEX_DIR` will find it works with `clone` but not `list` or `info`. This is the most likely production bug to surface. Fix: pass codexDir through `loadConfiguration` in list and info commands, or at least check `process.env.CXS_CLONER_CODEX_DIR` as a fallback.

**Risk 2: `turnCountOriginal` for compacted sessions** [P3 — Accuracy]
For compacted sessions, the "original turn count" in statistics includes pre-compaction turns that were never strippable. Users may find the reported numbers confusing (e.g., "40 turns → 30 turns" when only 40 of those were post-compaction). Low severity since the file size reduction is the primary metric.

**Risk 3: TC-9.2.2 untested composition** [P3 — Config correctness]
If someone changes `buildStripConfig` to not use `cxsConfig.defaultPreset`, no test would catch it. The logic is simple and unlikely to break, but the coverage gap is real.

**Tech Debt 1: `_preTurnRange` in `stripRecords` signature**
Dead parameter. Either remove it and update the call site in `clone-operation-executor.ts`, or document why it's retained.

**Tech Debt 2: Duplicate formatFileSize**
Extract to a shared utility or the formatter module.

**Tech Debt 3: No CLI-level command tests**
The command layer (argument parsing → config building → error handling) is tested only through collaborator unit tests. A few integration tests that exercise `normalizeArgs → clone-command → executeCloneOperation` end-to-end (bypassing the filesystem for the clone operation) would close coverage gaps in the CLI wire-up.

---

## 8. Overall Assessment

### Grade: A-

**Ship-ready with one P2 caveat** (env var not respected in list/info).

The core implementation — zone-based stripping, turn boundary calculation, tool call pairing, reasoning stripping, telemetry filtering, turn_context instruction stripping — is correctly implemented and comprehensively tested. The algorithmic core is the hardest part of this tool, and it's solid. The integration tests exercise the full pipeline with real filesystem I/O and real JSONL parsing, providing strong confidence in end-to-end correctness.

The type system is clean: no `any`, discriminated unions are correctly modeled, forward-compat index signatures are in the right places. The atomic write pattern is correct. Error messages are user-friendly and diagnostic. The barrel exports are comprehensive.

The gaps are minor:
- One functional spec violation (env var in list/info) that's easy to fix
- A couple of statistical reporting inaccuracies that don't affect stripping behavior
- Test coverage that's strong at the unit level but has gaps at the CLI integration level

**What would make this an A:** Fix the env var issue in list/info commands, add an end-to-end TC-9.2.2 test, and document or remove the `_preTurnRange` parameter.

| Category | Score |
|----------|-------|
| Architecture compliance | 10/10 |
| AC/TC coverage | 9/10 (TC-9.2.2 composition gap) |
| Core algorithm correctness | 10/10 |
| Type safety | 10/10 |
| Error handling | 9/10 (env var gap in list/info) |
| Test quality | 9/10 (CLI layer untested) |
| Code quality | 9/10 (minor duplication, dead param) |
| **Overall** | **9.4/10** |
