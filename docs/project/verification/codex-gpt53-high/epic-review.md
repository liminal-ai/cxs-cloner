# Epic Review: Codex Session Cloner (cxs-cloner)

## Findings (Ordered by Severity)

### P2-1: `info` default output does not show record-type counts by default
- Epic UF-2 describes record counts by type as part of displayed info output.
- Current implementation only prints record breakdown behind `--verbose`.
- References:
  - `src/commands/info-command.ts:91`
  - `src/commands/info-command.ts:94`
  - `src/commands/info-command.ts:103`
- Impact:
  - Potential UX/spec mismatch for normal `info` usage.

### P2-2: Layered config is implemented but not consistently applied across commands
- `clone` uses layered config via loader.
- `list` and `info` bypass config loader and resolve codex dir directly from flag/home dir.
- References:
  - `src/commands/clone-command.ts:80`
  - `src/commands/list-command.ts:36`
  - `src/commands/info-command.ts:39`
  - `src/config/configuration-loader.ts:35`
- Impact:
  - AC-9 intent ("layered configuration") is only fully realized in clone path.

### P3-1: "zero tool calls" warning path from epic is not surfaced
- Epic error path calls for warning when cloning a session with zero tool calls.
- Executor/formatter currently do not emit an explicit warning for this condition.
- References:
  - `src/core/clone-operation-executor.ts:19`
  - `src/output/clone-result-formatter.ts:34`
- Impact:
  - Minor compliance/UX gap.

### P3-2: Session-not-found path lacks suggestion candidates
- Epic mentions candidate suggestions for not-found path.
- Current scanner throws `SessionNotFoundError(partialId)` without candidate generation.
- References:
  - `src/io/session-directory-scanner.ts:127`
  - `src/errors/clone-operation-errors.ts:17`
- Impact:
  - Lower discoverability for typo/near-miss IDs.

### P3-3: Parser/runtime type safety relies heavily on unchecked casts
- Raw JSON is cast directly to typed payloads in reader/core paths.
- References:
  - `src/io/session-file-reader.ts:120`
  - `src/io/session-file-reader.ts:252`
  - `src/core/record-stripper.ts:85`
- Impact:
  - Forward-compat and malformed-shape robustness risk (even when JSON syntax is valid).

---

## Scope Reviewed

- `docs/project/epics/01-codex-session-cloner/epic.md`
- `docs/project/epics/01-codex-session-cloner/tech-design.md`
- Every source file in `src/`
- Every test file in `test/`
- Tests were not rerun per instruction (assumed prior result: 141 pass, 0 fail).

---

## Architecture Compliance (Tech Design vs Implementation)

### Module structure
Compliant. The implemented module layout matches the tech design:
- CLI entry and arg normalization:
  - `src/cli.ts`
  - `src/cli/normalize-args.ts`
- Commands:
  - `src/commands/main-command.ts`
  - `src/commands/list-command.ts`
  - `src/commands/info-command.ts`
  - `src/commands/clone-command.ts`
- Config:
  - `src/config/configuration-loader.ts`
  - `src/config/configuration-schema.ts`
  - `src/config/default-configuration.ts`
  - `src/config/tool-removal-presets.ts`
- Core:
  - `src/core/clone-operation-executor.ts`
  - `src/core/record-stripper.ts`
  - `src/core/turn-boundary-calculator.ts`
- IO/output/types/errors are all present and aligned.

### Flow compliance
Clone flow is strongly aligned with design:
1. Find session by partial ID: `src/core/clone-operation-executor.ts:23`
2. Parse file (strict toggled by `--force`): `src/core/clone-operation-executor.ts:29`
3. Identify turns: `src/core/clone-operation-executor.ts:34`
4. Strip records: `src/core/clone-operation-executor.ts:37`
5. New UUID + session meta update: `src/core/clone-operation-executor.ts:45`, `:48`
6. Write output: `src/core/clone-operation-executor.ts:51`
7. Final stats merge: `src/core/clone-operation-executor.ts:65`

### Interface compliance notes
- `stripRecords` includes `_preTurnRange` but does not use it:
  - `src/core/record-stripper.ts:40`
- Not breaking behavior, but indicates slight interface drift from intended seam responsibilities.

---

## AC/TC Coverage Assessment

## AC-1 Session Discovery
Implemented and tested.
- Scanner recursion/order/limit/codex-dir:
  - `src/io/session-directory-scanner.ts:40`
  - `test/io/session-directory-scanner.test.ts:50`, `:71`, `:122`, `:154`
- Metadata and first-user-message extraction:
  - `src/io/session-file-reader.ts:95`
  - `test/io/session-file-reader.test.ts:43`, `:76`, `:126`

## AC-2 Session Info
Core behavior implemented; one presentation gap.
- Parse + stats:
  - `src/commands/info-command.ts:44`
  - `src/io/session-file-reader.ts:299`
- Compaction/turns/size-token reporting:
  - `src/commands/info-command.ts:78`
  - `src/commands/info-command.ts:83`
- Gap:
  - record-type counts in human output are gated by `--verbose` (`src/commands/info-command.ts:91`).

## AC-3 JSONL Parsing
Implemented and well tested.
- Unknown type passthrough + debug log:
  - `src/io/session-file-reader.ts:263`
  - `src/io/session-file-reader.ts:273`
- Malformed behavior strict/non-strict:
  - `src/io/session-file-reader.ts:254`
  - `src/io/session-file-reader.ts:257`
- Tests:
  - `test/io/session-file-reader.test.ts:506`, `:541`, `:662`, `:703`

## AC-4 Turn Boundary Identification
Implemented and well tested.
- Last top-level compacted boundary logic:
  - `src/core/turn-boundary-calculator.ts:33`
- Post-compaction `turn_context` detection:
  - `src/core/turn-boundary-calculator.ts:47`
- Tool-bearing subtype detection:
  - `src/core/turn-boundary-calculator.ts:8`
- Tests:
  - `test/core/turn-boundary-calculator.test.ts:28`, `:234`, `:303`, `:396`, `:420`

## AC-5 Zone-Based Tool Stripping
Implemented and well tested.
- Zone computation:
  - `src/core/record-stripper.ts:282`
- Removed zone + call_id paired output handling:
  - `src/core/record-stripper.ts:74`
  - `src/core/record-stripper.ts:100`
- Truncation (output + args JSON):
  - `src/core/record-stripper.ts:118`
  - `src/core/record-stripper.ts:334`
  - `src/core/record-stripper.ts:356`
- Empty-turn removal:
  - `src/core/record-stripper.ts:416`
- Tests:
  - `test/core/record-stripper.test.ts:92`, `:133`, `:191`, `:295`

## AC-6 Reasoning Stripping
Implemented and tested.
- Mode behavior:
  - `src/core/record-stripper.ts:155`
- `compaction` response_item preserved:
  - `src/core/record-stripper.ts:165`
- CLI mode resolution logic:
  - `src/commands/clone-command.ts:141`
- Tests:
  - `test/core/record-stripper.test.ts:376`, `:423`, `:453`

## AC-7 Telemetry and Context Stripping
Implemented and tested.
- Event preserve list filter:
  - `src/core/record-stripper.ts:185`
- Turn-context zone-dependent stripping:
  - `src/core/record-stripper.ts:200`
- Ghost snapshot removal:
  - `src/core/record-stripper.ts:213`
- Tests:
  - `test/core/record-stripper.test.ts:492`, `:562`, `:637`

## AC-8 Clone Output
Implemented and tested.
- New thread ID:
  - `src/core/clone-operation-executor.ts:45`
- `session_meta` rewrite + `forked_from_id`:
  - `src/core/clone-operation-executor.ts:87`
- Writer output location/naming + atomic write:
  - `src/io/session-file-writer.ts:16`
  - `src/io/session-file-writer.ts:69`
- Resumability flag:
  - `src/core/clone-operation-executor.ts:78`
- Formatter output:
  - `src/output/clone-result-formatter.ts:69`
- Integration tests:
  - `test/integration/clone-operation-executor.test.ts:108`, `:129`, `:151`, `:195`, `:250`, `:272`

## AC-9 Configuration
Implemented in loader and clone path; partial across CLI surface.
- Layering in loader:
  - `src/config/configuration-loader.ts:39`
- Env var mapping:
  - `src/config/default-configuration.ts:23`
- Clone uses loader + preset resolution:
  - `src/commands/clone-command.ts:80`
  - `src/commands/clone-command.ts:130`
- Tests:
  - `test/config/configuration-loader.test.ts:39`, `:47`
  - `test/config/tool-removal-presets.test.ts:26`, `:34`
- Gap:
  - list/info do not consume layered config (`src/commands/list-command.ts:36`, `src/commands/info-command.ts:39`).

## AC-10 Compacted Session Handling
Implemented and tested.
- Compaction-aware turns:
  - `src/core/turn-boundary-calculator.ts:33`
- Preservation and compaction stats in strip/executor:
  - `src/core/record-stripper.ts:269`
  - `src/core/clone-operation-executor.ts:65`
- Tests:
  - `test/core/record-stripper.test.ts:687`, `:728`, `:755`
  - `test/integration/clone-operation-executor.test.ts:314`

---

## Code Quality

### Patterns and naming
- Overall consistent and readable.
- Good stage-based structure in stripper and executor.
- Names are generally explicit and domain aligned.

### Error handling
- Strong custom error taxonomy:
  - `src/errors/clone-operation-errors.ts`
- Minor issue: scanner maps non-ENOENT failures to "not found" style message:
  - `src/io/session-directory-scanner.ts:54`

### Type safety
- Types are comprehensive and forward-compatible in declarations.
- Runtime shape checking is minimal; code relies on cast-heavy assumptions.
- Risk surfaces in parser + stripper payload operations.

### Readability
- High readability in core modules.
- Tests are clear, AC/TC-labeled, and easy to trace.

---

## Testing Quality

### Strengths
- Extensive unit coverage on core algorithm.
- Explicit AC/TC labels in tests make traceability strong.
- Integration tests cover clone pipeline invariants and metadata rewriting.

### Coverage gaps
1. No direct command-level tests for list/info/clone CLI behavior and human output.
2. Manual-only resumability TC remains non-automated (known in design).
3. Spec UX paths (zero-tool warning, not-found suggestions) are not represented because behavior is not implemented.

---

## Cross-Cutting Concerns

### Immutability
- Positive: `stripRecords` deep-clones input:
  - `src/core/record-stripper.ts:44`
- Positive: explicit immutability test:
  - `test/core/record-stripper.test.ts:897`

### Error messages
- Mostly clear and actionable.
- Missing richer not-found suggestions and zero-tools warning path.

### Type contracts
- Strong compile-time structure in `src/types/*`.
- Runtime contract enforcement is permissive.

### Barrel exports
- Good barrel hygiene:
  - `src/types/index.ts`
  - `src/index.ts`

---

## Integration Seams

### Config → stripper flow
- Good for clone path:
  - load/resolve config in command (`src/commands/clone-command.ts:80`, `:123`)
  - pass resolved `stripConfig` into executor/stripper (`src/core/clone-operation-executor.ts:37`)
- Inconsistency:
  - same config layering not used by list/info commands.

### Scanner → reader → executor pipeline
- Seam is correct and coherent:
  - scanner lookup (`src/core/clone-operation-executor.ts:23`)
  - parser strictness from `force` (`src/core/clone-operation-executor.ts:29`)
  - turn identification then stripping (`src/core/clone-operation-executor.ts:34`, `:37`)
  - write and resumability (`src/core/clone-operation-executor.ts:51`, `:78`)

---

## Risks and Technical Debt

### Medium
1. Config behavior inconsistency across commands.
2. Info default output mismatch vs epic display expectation.
3. Memory scaling risk from full-line buffering parse path (`src/io/session-file-reader.ts:206`, `:243`).

### Low
1. Missing zero-tool warning path.
2. Session-not-found suggestion quality.
3. Unused `preTurnRange` argument in stripper signature.

---

## Overall Assessment

- **Architecture compliance:** Strong with minor flow/presentation divergences.
- **AC/TC compliance:** High overall; small but meaningful gaps in UX/config integration expectations.
- **Code quality:** Good core quality, clear structure, acceptable error model, moderate runtime-type-risk.
- **Testing quality:** Strong core and integration coverage, weaker command UX coverage.

**Ship readiness:** **Conditional ship**.

**Grade:** **B+**

Raise to **A- / A** by addressing:
1. info default record-count display alignment,
2. consistent layered config usage across list/info/clone,
3. zero-tool warning + not-found suggestion polish,
4. command-level behavior tests.
