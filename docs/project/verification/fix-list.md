# Fix List: Codex Session Cloner (cxs-cloner)

**Compiled from:** 5 independent verification reports (Opus 4.6, Sonnet 4.6, GPT-5.3 High, GPT-5.3 XHigh, GPT-5.2 XHigh)
**Date:** 2026-02-28
**Baseline:** 141 tests passing, 0 failing

---

## Tier 1: Must-Fix (Ship Blockers)

### MF-1: Config consistency — list/info bypass loadConfiguration(), env var ignored

**What's wrong:**
`list-command.ts:36` and `info-command.ts:39` both construct `codexDir` directly from CLI args and `homedir()`:
```typescript
const codexDir = args["codex-dir"] || join(homedir(), ".codex");
```
Neither calls `loadConfiguration()`. Only `clone-command.ts:80-82` goes through the config loader. This means:
- `CXS_CLONER_CODEX_DIR` env var is silently ignored by `list` and `info`
- Config file `codexDir` setting is ignored by `list` and `info`
- `list` and `info` do not resolve custom presets or any other config properties (irrelevant today but architecturally inconsistent)

**What the spec says:**
- Epic AC-9.1: "when the tool runs" — implies all commands respect env vars (epic.md:331-334)
- Tech design, Module Responsibility Matrix: `configuration-loader` covers AC-9.1 (tech-design.md:230)
- Tech design, Medium Altitude: "For list and info commands, the flow is simpler — scanner → reader → formatter, without the core stripping pipeline" — but does not say config loading is excluded (tech-design.md:272-273)

**What the fix should be:**
1. In `list-command.ts:36`, replace the manual codexDir construction with a call to `loadConfiguration()`:
   ```typescript
   const cxsConfig = await loadConfiguration(
       args["codex-dir"] ? { codexDir: args["codex-dir"] } : undefined,
   );
   const codexDir = cxsConfig.codexDir;
   ```
2. Do the same in `info-command.ts:39`.
3. Add test coverage: set `CXS_CLONER_CODEX_DIR` env var and verify `list`/`info` use it (extend `configuration-loader.test.ts` or add command-level tests).

**Found by:** Sonnet, GPT-5.3 High, GPT-5.3 XHigh, GPT-5.2 XHigh (all flagged as P2)

**Caveats:** `loadConfiguration()` uses `c12` which does async file resolution. List and info don't need any config properties beyond `codexDir`, so an alternative lighter fix would be to add `process.env.CXS_CLONER_CODEX_DIR` as a fallback in the manual construction: `args["codex-dir"] || process.env.CXS_CLONER_CODEX_DIR || join(homedir(), ".codex")`. However, using `loadConfiguration()` is the architecturally correct fix and maintains consistency.

---

### MF-2: Node 18 engine declaration vs actual API usage (Dirent.parentPath, recursive readdir)

**What's wrong:**
`package.json:37-39` declares `"engines": { "node": ">=18.0.0" }`, but `session-directory-scanner.ts` uses two APIs not available in Node 18:

1. `session-directory-scanner.ts:62-65` — `readdir` with `recursive: true`:
   ```typescript
   const entries = await readdir(sessionsDir, {
       recursive: true,
       withFileTypes: true,
   });
   ```
   `recursive` option was added in Node 18.17.0 experimentally, stabilized in Node 20.

2. `session-directory-scanner.ts:84` — `Dirent.parentPath`:
   ```typescript
   const parentDir = entry.parentPath ?? sessionsDir;
   ```
   `Dirent.parentPath` was added in Node 20.12.0 (it was `Dirent.path` in 20.0, renamed to `parentPath` later). Not available in Node 18.

**What the spec says:**
- Epic Assumptions: "Users have Bun or Node.js 18+ installed" (epic.md:545)
- Tech design, Runtime Prerequisites: "Bun v1.1+ or Node.js 18+" (tech-design.md:141)

**What the fix should be:**
Option A (preferred — update engine requirement):
- Change `package.json:38` to `"node": ">=20.12.0"`. The tool is primarily Bun-targeted (scripts use `bun test`, `bun build`). Node 18 reached EOL in April 2025. Updating the engine requirement is the simplest fix.

Option B (if Node 18 support is required):
- Replace `readdir({ recursive: true })` in `session-directory-scanner.ts:62-65` with an explicit recursive walk using `readdir` + `stat`:
  ```typescript
  async function walkDirectory(dir: string): Promise<{filePath: string; fileName: string}[]> {
      const results: {filePath: string; fileName: string}[] = [];
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
              results.push(...await walkDirectory(fullPath));
          } else if (entry.isFile() || entry.isSymbolicLink()) {
              results.push({ filePath: fullPath, fileName: entry.name });
          }
      }
      return results;
  }
  ```
- Remove the `Dirent.parentPath` usage at line 84 since `walkDirectory` constructs full paths.
- Update tests in `session-directory-scanner.test.ts` that depend on the recursive behavior (they should still pass since behavior is identical).

**Found by:** GPT-5.3 XHigh (P1), GPT-5.2 XHigh (Must-fix)

**Caveats:** All tests currently pass because they run under Bun, which supports both APIs. This issue only manifests when running under Node < 20.12. If the project is Bun-only, Option A is sufficient — just update the engine field and add a note.

---

### MF-3: Compaction stats gap — response_item.type="compaction" not counted in clone statistics

**What's wrong:**
`record-stripper.ts:269-270` computes compaction statistics using only top-level `"compacted"` records:
```typescript
compactionDetected: cloned.some((r) => r.type === "compacted"),
compactedRecordCount: cloned.filter((r) => r.type === "compacted").length,
```

This ignores `response_item` records of subtype `"compaction"` (inline encrypted compaction items). A session could have compaction only via `response_item.type="compaction"` (no top-level `compacted` records), and the statistics would report `compactionDetected: false, compactedRecordCount: 0`.

The reader's `computeSessionStatistics` (`session-file-reader.ts:354-356`) correctly counts `compaction` response_items separately as `compactionItems`, but this is not surfaced in `CloneStatistics`.

**What the spec says:**
- Epic AC-10.1: "Both top-level compacted records and response_item records of subtype compaction are preserved" (epic.md:349)
- Epic AC-10.2: "the system SHALL report compaction status in clone statistics" — TC-10.2.1: "compaction_detected: true flag and count are included" (epic.md:356)
- The spec's intent is that compaction detection covers both forms.

**What the fix should be:**
1. In `record-stripper.ts:269-270`, update both checks to include `response_item` subtype `"compaction"`:
   ```typescript
   compactionDetected: cloned.some((r) =>
       r.type === "compacted" ||
       (r.type === "response_item" && (r.payload as { type: string }).type === "compaction")
   ),
   compactedRecordCount: cloned.filter((r) =>
       r.type === "compacted" ||
       (r.type === "response_item" && (r.payload as { type: string }).type === "compaction")
   ).length,
   ```
2. Add a test in `record-stripper.test.ts` for a session with only `response_item.type="compaction"` (no top-level `compacted`), verifying `compactionDetected: true` and correct count.
3. Update existing TC-10.2.1 integration test (`clone-operation-executor.test.ts:314`) to also verify counting when only `compaction` response_items exist (or add a separate test case).

**Found by:** GPT-5.2 XHigh (Must-fix)

**Caveats:** The stripper already correctly preserves `compaction` response_items (skips them at `record-stripper.ts:166-168`). This is purely a statistics reporting gap, not a data loss issue. However, downstream consumers relying on `compactionDetected` for conditional logic (e.g., adjusting preset behavior per Story 7) would get wrong results.

---

## Tier 2: Should-Fix (Quality/Correctness)

### SF-4: turnCountOriginal inflation for compacted sessions

**What's wrong:**
`record-stripper.ts:261` computes `turnCountOriginal` by counting ALL `turn_context` records in the cloned array:
```typescript
turnCountOriginal: cloned.filter((r) => r.type === "turn_context").length,
```

This includes pre-compaction `turn_context` records that `identifyTurns` does NOT treat as turns (they're in the pre-turn range). For a compacted session with 5 pre-compaction `turn_context` records and 20 post-compaction `turn_context` records, `turnCountOriginal` reports 25 instead of 20.

**What the spec says:**
- Epic, CloneStatistics contract: `turnCountOriginal: number` — intended as "number of turns in the original session" (epic.md:488)
- The `identifyTurns` function returns `turns` containing only post-compaction turns, which is the correct count.

**What the fix should be:**
Use `turns.length` (from the function parameter) instead of counting from the cloned array:
```typescript
turnCountOriginal: turns.length,
```
This matches what `identifyTurns` considers "turns" — only the post-compaction `turn_context` records.

Alternatively, since `stripRecords` doesn't have access to the full `TurnIdentificationResult`, pass the count through. The simplest change is at `record-stripper.ts:261`:
```typescript
turnCountOriginal: turns.length,
```

**Files to change:** `src/core/record-stripper.ts:261`

**Found by:** Sonnet (P3)

**Caveats:** Only affects statistics display. Does not affect stripping behavior. The TC-8.5.1 integration test (`clone-operation-executor.test.ts:272`) uses a non-compacted session (`turnCountOriginal === 3`) so it doesn't expose this. Add a test with a compacted session fixture to verify the corrected count.

---

### SF-5: Info default output — record counts behind --verbose

**What's wrong:**
`info-command.ts:91-103` gates the per-type record breakdown behind `--verbose`:
```typescript
if (verbose) {
    console.log("");
    console.log("Record breakdown:");
    printIfNonZero("  Messages", stats.messages);
    printIfNonZero("  Function calls", stats.functionCalls);
    // ...
}
```

The default (non-verbose) `info` output shows: session metadata, turns, file size, compaction status. It does NOT show record counts by type (messages, function calls, reasoning blocks, etc.).

**What the spec says:**
- Epic UF-2, step 3: "System displays: ... Record counts by type (messages, tool calls, reasoning blocks, event messages)" (epic.md:46)
- Epic AC-2.1: "The system SHALL parse a complete session JSONL file and report record-level statistics" (epic.md:133)
- TC-2.1.1/2.1.2/2.1.3: All describe `info` reporting counts (epic.md:135-137)

**What the fix should be:**
Move the key record counts (function calls, reasoning blocks, event messages) out from behind the `--verbose` gate. Keep verbose for secondary detail (per-subtype breakdown, shell calls, custom tools, etc.):

In `info-command.ts`, after line 89 (after compaction output), add:
```typescript
console.log("");
console.log(`Records: ${stats.functionCalls} tool calls, ${stats.reasoningBlocks} reasoning, ${stats.eventMessages} events, ${stats.messages} messages`);
```

Then keep the `if (verbose)` block for the full per-subtype breakdown.

**Files to change:** `src/commands/info-command.ts:90` (insert summary line before verbose block)

**Found by:** GPT-5.3 High (P2), GPT-5.3 XHigh (P2)

**Caveats:** Judgment call on how much to show by default. The epic says "record counts by type" in UF-2. A summary line with the major counts satisfies the spec intent without cluttering the default output.

---

### SF-6: TC-9.2.2 end-to-end composition test missing

**What's wrong:**
TC-9.2.2 specifies: "Given a config file with `defaultPreset: 'aggressive'`, when `--strip-tools` is used without a preset name, then the `aggressive` preset is applied instead of `default`."

The current test in `tool-removal-presets.test.ts:34-41` only verifies that `resolvePreset("default", customPresets)` returns custom values when a custom preset overrides the built-in name. It does NOT test the full flow: config file with `defaultPreset` → `loadConfiguration` → `buildStripConfig` → preset resolved with config's `defaultPreset` value.

The two halves work independently (`loadConfiguration` returns `defaultPreset`, `resolvePreset` uses it), but there is no test verifying the composition through `clone-command.ts:133-137`:
```typescript
const presetName =
    stripToolsValue && stripToolsValue !== "true"
        ? stripToolsValue
        : cxsConfig.defaultPreset;
toolPreset = resolvePreset(presetName, cxsConfig.customPresets);
```

**What the spec says:**
- Epic TC-9.2.2: config file `defaultPreset` flows to preset resolution (epic.md:339)
- Tech design TC mapping: TC-9.2.2 maps to `presets` module (tech-design.md:621)

**What the fix should be:**
Add an integration test that:
1. Creates a temp config file with `{ defaultPreset: "heavy" }` (or a custom preset name)
2. Calls `loadConfiguration()` with that config
3. Calls `buildStripConfig(config, true, undefined, false, undefined)` (simulating `--strip-tools` with no value)
4. Asserts the resolved `toolPreset` has the values from the "heavy" preset (keep=10, truncate=80)

Since `buildStripConfig` is a module-private function in `clone-command.ts`, either:
- Export it for testing, or
- Write the test at the integration level by constructing a full `ResolvedCloneConfig` and verifying the stripConfig properties, or
- Test indirectly by writing a temp config file, constructing a session fixture, and running `executeCloneOperation` with the config

The simplest approach: export `buildStripConfig` from `clone-command.ts` and test it directly.

**Files to change:** `src/commands/clone-command.ts` (export `buildStripConfig`), new test file or addition to `test/config/configuration-loader.test.ts`

**Found by:** Sonnet (Gap), GPT-5.3 High (noted)

**Caveats:** Low risk of actual breakage since the composition is trivial (`cxsConfig.defaultPreset` is a string passed to `resolvePreset`). But the coverage gap is real per TC requirements.

---

### SF-7: Zero-tool-call warning not implemented

**What's wrong:**
No code in any file emits a warning when cloning a session with zero tool calls. The executor (`clone-operation-executor.ts`) runs the pipeline successfully (reasoning/telemetry still stripped), but produces no diagnostic output about the absence of tool calls.

**What the spec says:**
- Epic UF-3, Error paths: "Session has zero tool calls → clone proceeds (reasoning/telemetry still stripped), warning emitted" (epic.md:67)

**What the fix should be:**
In `clone-operation-executor.ts`, after `identifyTurns` returns (line 34), check if zero tool-bearing turns exist:
```typescript
const turnResult = identifyTurns(parsed.records);

// Check for zero tool-bearing turns
const toolBearingCount = turnResult.turns.filter(t => t.isToolBearing).length;
if (config.stripConfig.stripTools && toolBearingCount === 0) {
    consola.warn("Session has no tool calls. Reasoning and telemetry will still be stripped.");
}
```

Add `import consola from "consola"` to the executor if not present.

Alternatively, add a `warnings: string[]` field to `CloneResult` and surface warnings in the formatter.

Add a test: use the existing zero-tool-call test in `clone-operation-executor.test.ts:336` as a base — verify warning is emitted (use consola mock or check return value).

**Files to change:** `src/core/clone-operation-executor.ts:34` (add warning check)

**Found by:** GPT-5.3 High (P3), GPT-5.3 XHigh (P3), GPT-5.2 XHigh (Should-fix)

**Caveats:** This is a UX polish item. The clone still succeeds correctly. The warning is informational — "you asked to strip tools but there were no tools to strip."

---

### SF-8: Session-not-found candidate suggestions not populated

**What's wrong:**
`SessionNotFoundError` (`clone-operation-errors.ts:17-28`) accepts optional `candidates?: string[]` and formats a "Did you mean: ..." message when candidates are provided. However, the throw site at `session-directory-scanner.ts:127-128` never passes candidates:
```typescript
if (matches.length === 0) {
    throw new SessionNotFoundError(partialId);
}
```

The "Did you mean" code path at `clone-operation-errors.ts:22-23` is dead code.

**What the spec says:**
- Epic UF-3, Error paths: "Session not found → error with suggestions (partial match candidates)" (epic.md:66)
- Tech design, Error Responses: "Session not found → Error + partial match suggestions" (tech-design.md:130)

**What the fix should be:**
In `session-directory-scanner.ts:127-128`, before throwing, generate candidate suggestions by finding sessions whose thread IDs are closest to the partial ID:
```typescript
if (matches.length === 0) {
    // Generate candidates: find sessions with partial substring match
    const candidates = sessions
        .filter(s => s.threadId.includes(partialId) || partialId.includes(s.threadId.slice(0, partialId.length)))
        .map(s => s.threadId)
        .slice(0, 5);
    throw new SessionNotFoundError(partialId, candidates.length > 0 ? candidates : undefined);
}
```

A simpler approach: just pass the first few available session IDs as reference:
```typescript
const candidates = sessions.slice(0, 5).map(s => s.threadId);
throw new SessionNotFoundError(partialId, candidates);
```

**Files to change:** `src/io/session-directory-scanner.ts:127-128`

**Found by:** GPT-5.3 High (P3), GPT-5.3 XHigh (P3), GPT-5.2 XHigh (Should-fix)

**Caveats:** The quality of suggestions depends on the approach. Simple prefix/substring matching is adequate. Levenshtein distance is overkill for UUIDs. The simplest useful approach is to show a few recent session IDs so the user can verify they're looking in the right directory.

---

## Tier 3: Nice-to-Have

### Cosmetic/Debt

#### NH-9: Extract duplicated formatFileSize

**What's wrong:**
`formatFileSize` is defined identically in `list-command.ts:108-116` and `info-command.ts:114-122`. A third variant named `formatBytes` exists in `clone-result-formatter.ts:80-89` with slightly different formatting (no `~` prefix, uses `.toFixed(1) KB` instead of `Math.round`).

**What the spec says:** No specific requirement. DRY principle.

**What the fix should be:**
Extract a single `formatFileSize` function to a shared utility (e.g., `src/output/format-utils.ts`) and import it in all three locations. Decide on one consistent format.

**Files to change:** New file `src/output/format-utils.ts`, `src/commands/list-command.ts:108-116` (remove, import), `src/commands/info-command.ts:114-122` (remove, import), `src/output/clone-result-formatter.ts:80-89` (remove, import)

**Found by:** Opus (minor observation 1), Sonnet (Issue 5)

---

#### NH-10: Remove/document _preTurnRange unused parameter

**What's wrong:**
`record-stripper.ts:40` accepts `_preTurnRange: { startIndex: number; endIndex: number }` but never references it. The underscore prefix suppresses the unused variable warning. Pre-turn records are preserved implicitly (records outside any zone mapping pass through unchanged).

**What the spec says:**
- Tech design, Skeleton Requirements: `stripRecords` signature includes `preTurnRange` (tech-design.md:508)

**What the fix should be:**
Option A: Remove the parameter from `stripRecords` and update the call site in `clone-operation-executor.ts:37-42`.
Option B: Add a JSDoc comment explaining why it exists (interface parity with tech design) and that pre-turn records are handled implicitly.

**Files to change:** `src/core/record-stripper.ts:40`, `src/core/clone-operation-executor.ts:39-40`

**Found by:** Opus (observation 3), Sonnet (Issue 3), GPT-5.3 High, GPT-5.2 XHigh

---

#### NH-11: Integrate configured-logger or remove it

**What's wrong:**
`configured-logger.ts` defines `createLogger()` (lines 22-45) and is exported from `src/index.ts:99`. However, no command file imports or uses it. All commands use `consola` directly or `console.log/error`.

**What the spec says:**
- Tech design, Module Layout: `configured-logger.ts` listed as "consola logging setup" (tech-design.md:180)

**What the fix should be:**
Either:
- Remove `configured-logger.ts` and its exports from `src/index.ts:99-100` if it's not needed.
- Or integrate it into the command files (replace `consola` direct imports with `createLogger()`).

**Files to change:** `src/output/configured-logger.ts` (remove or integrate), `src/index.ts:99-100`

**Found by:** Opus (Low Risk 2), GPT-5.3 XHigh, GPT-5.2 XHigh

---

#### NH-12: Add missing-directory error path test for scanner

**What's wrong:**
`session-directory-scanner.ts:47-59` handles missing/non-directory sessions paths, but no test exercises the ENOENT error path (directory doesn't exist). TC-1.1.3 covers the empty directory case but not the missing directory case. The error message string `"Codex sessions directory not found at ..."` is untested.

**What the spec says:**
- Tech design, Runtime Prerequisites: "Tool checks and reports error if missing" (tech-design.md:142)

**What the fix should be:**
Add a test in `session-directory-scanner.test.ts` that calls `scanSessionDirectory` with a non-existent directory and asserts:
- A `CxsError` is thrown
- The message contains the directory path

**Files to change:** `test/io/session-directory-scanner.test.ts` (add test case)

**Found by:** Sonnet (Issue 6), GPT-5.3 High

---

#### NH-13: Remove validateStrippingFlags from SDK barrel exports

**What's wrong:**
`src/index.ts:103` exports `validateStrippingFlags` from `./cli/normalize-args.js`. This is a CLI validation helper, not an SDK-facing function. SDK consumers don't need a function that throws `ArgumentValidationError` for missing CLI flags.

**What the spec says:** No specific requirement about SDK surface area beyond "SDK exports via index.ts" (epic.md:521).

**What the fix should be:**
Remove line 103 from `src/index.ts`:
```typescript
// Remove: export { validateStrippingFlags } from "./cli/normalize-args.js";
```

**Files to change:** `src/index.ts:103`

**Found by:** GPT-5.2 XHigh (noted)

**Caveats:** Breaking change for any SDK consumer that imports `validateStrippingFlags`. Since this is pre-1.0, acceptable.

---

### Test Gaps

#### NH-14: No CLI command-level tests for list/info/clone

**What's wrong:**
No test files exist in `test/commands/`. All command logic (argument parsing → config building → error handling → output formatting) is tested only through collaborator unit tests. The command `catch` blocks (error printing, `process.exit(1)`) are untested.

**What the spec says:** No specific test structure requirement, but TC coverage expects command-level behavior.

**What the fix should be:**
Create `test/commands/clone-command.test.ts`, `test/commands/list-command.test.ts`, `test/commands/info-command.test.ts` with tests that exercise the command `run` functions with mock arguments. At minimum, test:
- Error handling (invalid args → error output + exit)
- Happy path output format (human vs JSON)

**Found by:** Sonnet (Gap), GPT-5.3 High, GPT-5.3 XHigh, GPT-5.2 XHigh

---

#### NH-15: TC-5.1.1 doesn't verify preserved-zone tool calls remain

**What's wrong:**
`record-stripper.test.ts:92` (TC-5.1.1) asserts `functionCallsRemoved === 10` and `functionCallsTruncated === 10`, which implies 10 tool-bearing turns are in the preserved zone. But it doesn't independently verify that preserved-zone function_call records still exist in the output.

**What the spec says:**
- Epic TC-5.1.1: "10 turns fully stripped, 10 turns truncated, 10 turns preserved at full fidelity" (epic.md:204)

**What the fix should be:**
Add an assertion to the TC-5.1.1 test block:
```typescript
const remainingFunctionCalls = result.records.filter(
    r => r.type === "response_item" && (r.payload as { type: string }).type === "function_call"
).length;
expect(remainingFunctionCalls).toBe(10); // preserved zone
```

**Files to change:** `test/core/record-stripper.test.ts` (TC-5.1.1 block)

**Found by:** Sonnet (Issue 7)

---

#### NH-16: No test for debug log emission on unknown types (TC-3.1.4)

**What's wrong:**
`session-file-reader.test.ts:506` (TC-3.1.4) verifies unknown record types are preserved in the output, but doesn't verify the `consola.debug` call is made. The test validates data preservation but not the logging behavior specified by TC-3.1.4.

**What the spec says:**
- Epic TC-3.1.4: "the record is preserved as-is (passthrough) with a debug-level log" (epic.md:164)
- Implementation: `session-file-reader.ts:264-266` calls `consola.debug(...)` for unknown types

**What the fix should be:**
Mock `consola.debug` in the TC-3.1.4 test and assert it was called with the expected message pattern.

**Files to change:** `test/io/session-file-reader.test.ts` (TC-3.1.4 block)

**Found by:** GPT-5.3 XHigh (noted)

---

#### NH-17: No test for warning emission on malformed JSON skip (TC-3.3.1/3.3.3)

**What's wrong:**
`session-file-reader.test.ts:177` (TC-3.3.1) and `session-file-reader.test.ts:703` (TC-3.3.3) verify malformed lines are skipped, but don't verify the `consola.warn` call is made. The spec says "skipped with a warning" — the warning emission is untested.

**What the spec says:**
- Epic TC-3.3.1: "the line is skipped with a warning and processing continues" (epic.md:172)
- Epic TC-3.3.3: "the line is skipped with a warning" (epic.md:174)
- Implementation: `session-file-reader.ts:122` and `session-file-reader.ts:257` call `consola.warn(...)`

**What the fix should be:**
Mock `consola.warn` and assert it was called for each malformed line skipped.

**Files to change:** `test/io/session-file-reader.test.ts` (TC-3.3.1 and TC-3.3.3 blocks)

**Found by:** GPT-5.3 XHigh (noted)

---

#### NH-18: No test for scanner missing-directory error message string

**What's wrong:**
Same as NH-12 — `session-directory-scanner.ts:58` throws `CxsError` with a specific message format when the sessions directory doesn't exist, but no test verifies the error message content.

**What the spec says:** Tech design expects a clear error when the directory is missing.

**What the fix should be:** Covered by NH-12 fix.

**Found by:** Sonnet (Issue 6)

---

#### NH-19: readFixtureSession would throw cryptic error on malformed fixture

**What's wrong:**
`test/fixtures/index.ts:12-21` defines `readFixtureSession`:
```typescript
export async function readFixtureSession(filename: string): Promise<RolloutLine[]> {
    const filePath = fixtureDataPath(filename);
    const content = await Bun.file(filePath).text();
    return content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as RolloutLine);
}
```

If a fixture file has malformed JSON, `JSON.parse` throws a generic `SyntaxError` with no indication of which fixture file or line caused the failure.

**What the spec says:** N/A (test utility, not production code)

**What the fix should be:**
Wrap the `JSON.parse` in a try/catch that includes the filename and line number in the error:
```typescript
.map((line, i) => {
    try {
        return JSON.parse(line) as RolloutLine;
    } catch (e) {
        throw new Error(`Malformed JSON in fixture "${filename}" at line ${i + 1}: ${e}`);
    }
})
```

**Files to change:** `test/fixtures/index.ts:17`

**Found by:** Opus (Coverage Gap 3)

---

#### NH-20: TC-8.5.1 integration test doesn't exercise event stripping

**What's wrong:**
`clone-operation-executor.test.ts:272` (TC-8.5.1) verifies all `CloneStatistics` fields are present and correctly typed, but the test session fixture doesn't include event_msg records that would be stripped. As a result, `eventMessagesRemoved` and `ghostSnapshotsRemoved` are verified to be `>= 0` but are actually 0.

**What the spec says:**
- Epic TC-8.5.1: "records removed by type (tool calls, reasoning, event messages, turn_context, ghost_snapshots)" (epic.md:326)

**What the fix should be:**
Enhance the TC-8.5.1 test fixture session to include event_msg records (e.g., `exec_command_begin`) and ghost_snapshot records. Then assert `eventMessagesRemoved > 0` and `ghostSnapshotsRemoved > 0`.

**Files to change:** `test/integration/clone-operation-executor.test.ts` (TC-8.5.1 block, ~line 272)

**Found by:** GPT-5.2 XHigh (noted)

---

### Naming/Semantics

#### NH-21: functionCallsRemoved counts initiations only, not paired outputs

**What's wrong:**
`record-stripper.ts:86-96` increments `functionCallsRemoved` only for tool call initiation subtypes (`function_call`, `local_shell_call`, `custom_tool_call`, `web_search_call`). The paired outputs (`function_call_output`, `custom_tool_call_output`) that are also removed (lines 100-114) are NOT counted. A pair removal of `function_call + function_call_output` increments the counter by 1, not 2.

The field name `functionCallsRemoved` in `CloneStatistics` (`clone-operation-types.ts`) and the UI label `"Tool calls:"` (`clone-result-formatter.ts:52`) conflate "tool call initiations" with "tool-call-related records."

**What the spec says:**
- Epic, `CloneStatistics`: `functionCallsRemoved: number` — no explicit clarification whether it counts initiations or all related records (epic.md:490)

**What the fix should be:**
This is a naming/documentation issue, not a behavioral bug. Options:
- Rename the field to `toolCallInitiationsRemoved` (breaking SDK change)
- Add JSDoc clarifying the counting semantics
- Add a separate `toolOutputsRemoved` counter

Recommendation: Add JSDoc comment to the `CloneStatistics` interface clarifying that `functionCallsRemoved` counts tool call initiation records, not paired outputs.

**Files to change:** `src/types/clone-operation-types.ts` (add JSDoc to `functionCallsRemoved`)

**Found by:** Sonnet (Issue 4)

---

#### NH-22: List command date source inconsistency (session_meta vs filename)

**What's wrong:**
`list-command.ts:75-78` displays the date from `meta.createdAt`, which comes from `session-file-reader.ts:170`:
```typescript
createdAt: new Date(sessionMeta.timestamp),
```
This is the `timestamp` field from the `session_meta` payload (the session creation time as recorded by Codex). The scanner also parses the timestamp from the filename (`session-directory-scanner.ts:30`), but `readSessionMetadata` uses the payload timestamp, not the filename timestamp.

These should normally agree, but could diverge if a session file is renamed or if the Codex client and filesystem clocks differ.

**What the spec says:**
- Epic AC-1.2: "extract session metadata from the filename and session_meta record" — implies both sources are available (epic.md:113)
- TC-1.2.1: "created_at matches 2026-02-28T14:30:00" — from filename (epic.md:115)

**What the fix should be:**
This is informational. Using `session_meta.timestamp` is the more authoritative source. Document the decision. No code change required unless you want to prefer the filename-derived timestamp for consistency with the scanner's `createdAt` field.

**Found by:** GPT-5.2 XHigh (noted)

---

### Output/UX

#### NH-23: List output missing cwd by default

**What's wrong:**
`list-command.ts:84-89` — `cwd` is only shown when `--verbose` is set:
```typescript
if (verbose) {
    const parts: string[] = [];
    // ...
    parts.push(`cwd: ${meta.cwd}`);
    // ...
}
```

**What the spec says:**
- Epic UF-1, step 3: "System displays sessions sorted by recency (newest first), showing: Session ID, Date/time, Working directory, First user message, File size" (epic.md:31-36)
- Working directory is listed as a default display item, not a verbose-only item.

**What the fix should be:**
Add `cwd` to the default (non-verbose) output line at `list-command.ts:82`:
```typescript
let line = `${shortId}  ${date}  ${size}  ${meta.cwd}  ${message}`;
```
Or add it as a separate line beneath the main line.

**Files to change:** `src/commands/list-command.ts:82`

**Found by:** GPT-5.2 XHigh (Should-fix)

**Caveats:** Adding cwd to the default line makes it quite long. Consider truncating the cwd path or showing just the basename. This is a UX judgment call.

---

#### NH-24: Clone formatter puts removal stats behind --verbose

**What's wrong:**
`clone-result-formatter.ts:49-58` gates the per-type removal breakdown behind `verbose`:
```typescript
if (verbose) {
    lines.push("  Removed:");
    lines.push(`    Tool calls:      ${stats.functionCallsRemoved}`);
    // ...
}
```

The default clone output shows size/turn summary but not what was removed.

**What the spec says:**
- Epic AC-8.5, TC-8.5.1: "the output includes: ... records removed by type (tool calls, reasoning, event messages, turn_context, ghost_snapshots)" (epic.md:326)
- This implies removal counts are part of default output.

**What the fix should be:**
Move the removal stats out from behind the `verbose` gate, or add a summary line to the default output:
```typescript
lines.push(`  Removed: ${stats.functionCallsRemoved} tool calls, ${stats.reasoningBlocksRemoved} reasoning, ${stats.eventMessagesRemoved} events`);
```

**Files to change:** `src/output/clone-result-formatter.ts:49`

**Found by:** GPT-5.3 XHigh (P2)

**Caveats:** Judgment call on how verbose default output should be. The size reduction percentage already conveys the magnitude of stripping.

---

#### NH-25: Formatter scope mismatch — no formatters for list/info

**What's wrong:**
The tech design's Flow 1 (list) and Flow 2 (info) both show a `Fmt` (formatter) participant in the sequence diagram. The implementation only has `formatCloneResult` in `clone-result-formatter.ts`. List and info commands format output directly with `console.log` calls in the command files.

**What the spec says:**
- Tech design, Flow 1 sequence diagram: "CLI->>Fmt: formatSessionList(sessions, options)" (tech-design.md:313)
- Tech design, Flow 2 sequence diagram: "CLI->>Fmt: formatSessionInfo(stats, options)" (tech-design.md:374)

**What the fix should be:**
Create formatter functions `formatSessionList` and `formatSessionInfo` (either in `clone-result-formatter.ts` or in new files) and call them from the commands. This improves testability — formatter logic can be tested without executing the command.

**Files to change:** `src/output/clone-result-formatter.ts` (add functions) or new files, `src/commands/list-command.ts`, `src/commands/info-command.ts`

**Found by:** GPT-5.2 XHigh (noted)

**Caveats:** Low priority. The current inline formatting works. Extracting formatters primarily benefits testability.

---

### Edge Cases

#### NH-26: Empty-turn cleanup with event_msg-only user content

**What's wrong:**
`record-stripper.ts:416-457`, `findEmptyTurnIndices` checks for the presence of `response_item.type="message"` to determine if a turn has conversational content (line 440-443):
```typescript
if (record.type === "response_item") {
    const payload = record.payload as { type: string };
    if (payload.type === "message") {
        hasMessage = true;
    }
}
```

If a removed-zone turn contains a preserved `event_msg.type="user_message"` but no `response_item.type="message"`, the turn is considered "empty" and all remaining records (including the preserved `user_message` event) are removed.

**What the spec says:**
- Epic AC-7.1: `user_message` events are in the preserve list (epic.md:271)
- Epic AC-5.5: "When all tool records in a turn are removed, the system SHALL remove the entire turn if no conversational content remains" (epic.md:233)
- The spec doesn't define "conversational content" precisely, but `user_message` events carry user input.

**What the fix should be:**
Extend the `hasMessage` check to also consider preserved `event_msg` records:
```typescript
if (record.type === "event_msg") {
    const eventPayload = record.payload as EventMsgPayload;
    if (preserveSet.has(eventPayload.type)) {
        hasMessage = true;
    }
}
```

This requires passing the `preserveSet` into `findEmptyTurnIndices`.

**Files to change:** `src/core/record-stripper.ts:416-457`

**Found by:** GPT-5.2 XHigh (edge case)

**Caveats:** This is an edge case. In practice, Codex always writes a `response_item.type="message"` for user input AND an `event_msg.type="user_message"`. Both would need to be absent for this to trigger. The `SessionBuilder` always includes user message response_items, so no test exercises this path.

---

#### NH-27: Metadata 50-line cap could miss first user message

**What's wrong:**
`session-file-reader.ts:26` sets `METADATA_READ_LINES = 50`. `readSessionMetadata` reads only the first 50 non-blank lines. If `session_meta` and the first user message are beyond line 50 (e.g., a file with a very long preamble or many non-session records at the top), `readSessionMetadata` will either throw `InvalidSessionError` (no `session_meta` found) or return `firstUserMessage: undefined`.

**What the spec says:**
- Epic AC-1.3: "The system SHALL extract the first user message for display" (epic.md:118)

**What the fix should be:**
This is acceptable for v1. Codex always writes `session_meta` as the first record, and the first user message typically appears within the first 10 records. The 50-line cap is a performance optimization to avoid reading entire large files for the `list` command.

If needed, increase `METADATA_READ_LINES` to 100 or add a comment documenting the assumption.

**Files to change:** `src/io/session-file-reader.ts:26` (increase or document)

**Found by:** GPT-5.3 XHigh (concern), GPT-5.2 XHigh (noted)

---

#### NH-28: EventMsgPayload.message cast without type guard

**What's wrong:**
`session-file-reader.ts:144` casts `payload.message` without runtime type checking:
```typescript
const message = payload.message as string | undefined;
```

`EventMsgPayload` has `[key: string]: unknown`, so `payload.message` is `unknown`. If `payload.message` is not a string (e.g., an object or number), the `truncateMessage` function would receive a non-string, and `text.length` would be `undefined`, causing the truncation to silently produce wrong output or pass through the non-string value.

**What the spec says:**
- The Codex protocol defines `user_message` events as having a string `message` field, but the type system doesn't enforce this.

**What the fix should be:**
Add a type guard before using the value:
```typescript
const rawMessage = payload.message;
const message = typeof rawMessage === "string" ? rawMessage : undefined;
```

**Files to change:** `src/io/session-file-reader.ts:144`

**Found by:** GPT-5.2 XHigh (noted), GPT-5.3 High (P3-3 — unchecked casts)

---

### Architecture/Design

#### NH-29: SessionBuilder callIdCounter module-level state

**What's wrong:**
`test/fixtures/builders/session-builder.ts:26` declares a module-level `callIdCounter`:
```typescript
let callIdCounter = 0;
```
It's reset to 0 in the `SessionBuilder` constructor (line 45). This works correctly for sequential single-threaded test runs, but is a potential source of flaky behavior if tests run with shared state or if a test creates multiple `SessionBuilder` instances without constructing new ones.

**What the spec says:** N/A (test fixture)

**What the fix should be:**
Move `callIdCounter` into the `SessionBuilder` class as a private instance field:
```typescript
export class SessionBuilder {
    private callIdCounter = 0;
    // ...
    private nextCallId(): string {
        this.callIdCounter++;
        return `call_${this.callIdCounter.toString().padStart(4, "0")}`;
    }
}
```

**Files to change:** `test/fixtures/builders/session-builder.ts:26-31`, `test/fixtures/builders/session-builder.ts:45`

**Found by:** Sonnet (noted in Code Quality)

---

#### NH-30: summary-only reasoning mode mutation is subtle

**What's wrong:**
`record-stripper.ts:174-178` uses `delete` to remove fields from the cloned record:
```typescript
} else if (config.reasoningMode === "summary-only") {
    const rPayload = record.payload as ReasoningPayload;
    delete rPayload.content;
    delete rPayload.encrypted_content;
}
```

This is correct (mutates the `structuredClone` copy, not the original), but the `delete` keyword on typed objects is unusual and could confuse maintainers. The pattern is safe here but subtle.

**What the spec says:** N/A (implementation style)

**What the fix should be:**
No functional change needed. Consider adding a comment:
```typescript
// Safe: mutating structuredClone copy, not original
delete rPayload.content;
delete rPayload.encrypted_content;
```

**Files to change:** `src/core/record-stripper.ts:174-178` (add comment)

**Found by:** Sonnet (Cross-cutting observation)

---

#### NH-31: No Zod validation of individual JSONL record structure

**What's wrong:**
`session-file-reader.ts:252` parses JSONL records with a bare `JSON.parse` and type assertion:
```typescript
record = JSON.parse(line) as RolloutLine;
```

No runtime validation confirms the parsed object has the expected `RolloutLine` shape (`timestamp`, `type`, `payload`). Valid JSON that doesn't match the `RolloutLine` structure (e.g., `{ "foo": "bar" }`) would pass through and could cause runtime errors in downstream modules.

**What the spec says:**
- Epic AC-3.1: "The system SHALL parse all five record types" (epic.md:159)
- The spec doesn't require Zod validation of records, but forward compatibility is a stated concern.

**What the fix should be:**
Add a minimal runtime check after `JSON.parse`:
```typescript
if (!record || typeof record.type !== "string" || !record.payload) {
    if (strict) {
        throw new MalformedJsonError(filePath, i + 1);
    }
    consola.warn(`Skipping structurally invalid record at line ${i + 1} in "${filePath}"`);
    continue;
}
```

Or define a Zod schema for `RolloutLine` envelope validation (not for every payload subtype — just the envelope).

**Files to change:** `src/io/session-file-reader.ts:252-259`

**Found by:** Opus (Medium Risk 4), GPT-5.3 High (P3-3)

**Caveats:** Adding full Zod validation for every record is heavyweight and may regress performance. A lightweight envelope check (`type` and `payload` existence) provides 80% of the protection.

---

#### NH-32: Memory amplification on large sessions (full read + structuredClone)

**What's wrong:**
The clone pipeline holds three copies of the session data in memory simultaneously:

1. `session-file-reader.ts:206-224` — `readAllLines` accumulates all lines as strings in a `string[]` array
2. `session-file-reader.ts:243-244` — `parseSessionFile` parses all lines into `RolloutLine[]`
3. `record-stripper.ts:44` — `stripRecords` calls `structuredClone(records)` creating a deep copy

Peak memory ≈ 3x the parsed object footprint + the raw string lines. For a 10MB session file, this could mean 30-50MB of memory usage.

**What the spec says:**
- No performance requirements stated. The tool targets "hours-long sessions" which can be large.

**What the fix should be:**
Acceptable for v1. Sessions are typically < 5MB. For a future optimization:
- Stream parsing: parse lines into records incrementally, discard raw strings
- Selective cloning: instead of `structuredClone(records)`, clone only records that will be mutated (truncated zone records and summary-only reasoning records)

Document the limitation.

**Found by:** Opus (Medium Risk 5), GPT-5.3 XHigh (concern), GPT-5.2 XHigh (noted)

---

#### NH-33: JSON Date serialization implicit in --json output

**What's wrong:**
`list-command.ts:62-63` serializes `SessionMetadata[]` with `JSON.stringify`:
```typescript
console.log(JSON.stringify(metadataList, null, 2));
```

`SessionMetadata` has `createdAt: Date` (`clone-operation-types.ts`). `JSON.stringify` implicitly calls `Date.prototype.toJSON()`, converting `Date` objects to ISO strings. This is correct behavior but:
- The type in the JSON output will be a string, not a `Date` — consumers need to know to re-parse
- No explicit `.toISOString()` is called, relying on implicit behavior
- Not documented in data contracts

**What the spec says:**
- Epic doesn't specify JSON output format for `list` command beyond "Output as JSON" (citty flag).

**What the fix should be:**
Add an explicit serialization mapping:
```typescript
const jsonData = metadataList.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
}));
console.log(JSON.stringify(jsonData, null, 2));
```

Or document that `createdAt` serializes as an ISO 8601 string in JSON output.

**Files to change:** `src/commands/list-command.ts:63` (or documentation)

**Found by:** Source code analysis (implicit behavior)

**Caveats:** The current behavior is correct — `JSON.stringify` on `Date` produces ISO strings. This is a documentation/explicitness issue, not a bug.

---

## Summary

| Tier | Count | Items |
|------|-------|-------|
| Must-Fix | 3 | MF-1, MF-2, MF-3 |
| Should-Fix | 5 | SF-4, SF-5, SF-6, SF-7, SF-8 |
| Nice-to-Have: Cosmetic/Debt | 5 | NH-9 through NH-13 |
| Nice-to-Have: Test Gaps | 7 | NH-14 through NH-20 |
| Nice-to-Have: Naming/Semantics | 2 | NH-21, NH-22 |
| Nice-to-Have: Output/UX | 3 | NH-23, NH-24, NH-25 |
| Nice-to-Have: Edge Cases | 3 | NH-26, NH-27, NH-28 |
| Nice-to-Have: Architecture/Design | 5 | NH-29 through NH-33 |
| **Total** | **33** | |

### Review Agreement Matrix

| Item | Opus | Sonnet | GPT-5.3 High | GPT-5.3 XHigh | GPT-5.2 XHigh |
|------|------|--------|--------------|----------------|----------------|
| MF-1 (config consistency) | — | P2 | P2 | P2 | P2 |
| MF-2 (Node 18 compat) | — | — | — | P1 | Must-fix |
| MF-3 (compaction stats) | — | — | — | — | Must-fix |
| SF-4 (turnCountOriginal) | — | P3 | — | — | — |
| SF-5 (info verbose) | — | — | P2 | P2 | — |
| SF-6 (TC-9.2.2) | — | Gap | noted | — | — |
| SF-7 (zero-tool warning) | — | — | P3 | P3 | Should-fix |
| SF-8 (not-found candidates) | — | — | P3 | P3 | Should-fix |
| NH-9 (formatFileSize) | minor | P4 | — | — | — |
| NH-10 (_preTurnRange) | minor | P4 | noted | — | noted |
| NH-11 (configured-logger) | Low Risk | — | — | noted | noted |
| NH-12 (scanner error test) | — | P4 | — | — | — |
| NH-13 (validateStrippingFlags) | — | — | — | — | noted |
| NH-14 (CLI command tests) | — | Gap | noted | noted | noted |
| NH-15 (TC-5.1.1 assertion) | — | P4 | — | — | — |
| NH-21 (naming) | — | P4 | — | — | — |
| NH-23 (list cwd) | — | — | — | — | Should-fix |
| NH-26 (empty turn) | — | — | — | — | edge case |
| NH-31 (Zod validation) | Med Risk | — | P3 | — | — |
| NH-32 (memory) | Med Risk | — | — | noted | noted |
