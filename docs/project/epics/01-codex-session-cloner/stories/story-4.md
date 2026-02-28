# Story 4: Record Stripping Algorithm

## Objective

After this story ships, the core stripping engine works: zone-based tool stripping with configurable presets, tool call removal with correct pairing, output truncation in the truncated zone, reasoning stripping (full/summary-only/none), telemetry event stripping per preserve-list, `turn_context` instruction stripping, ghost_snapshot removal, and empty turn cleanup. The preset system resolves built-in and custom presets.

## Scope

### In Scope

- Zone computation: assign each tool-bearing turn to removed/truncated/preserved zone based on preset parameters
- Tool call removal in removed zone with pairing rules:
  - `function_call` → paired `function_call_output` by `call_id`
  - `custom_tool_call` → paired `custom_tool_call_output` by `call_id`
  - `local_shell_call` → standalone removal
  - `web_search_call` → standalone removal
- Tool output truncation in truncated zone (string and `ContentItem[]` forms)
- `function_call` arguments truncation (parse JSON string, truncate string values, re-serialize)
- Reasoning stripping: `full` (remove all), `summary-only` (keep summary, drop content/encrypted_content), `none` (preserve)
- Telemetry `event_msg` stripping per preserve-list (preserve `user_message` and `error`, strip all others)
- Configurable event preserve-list override
- `turn_context` stripping: removed/truncated zones → remove entirely; preserved zone → keep structural fields, strip instruction fields
- `ghost_snapshot` removal
- Empty turn removal (turns with no remaining content after stripping)
- Compacted record preservation (both top-level `compacted` and `compaction` response_items)
- Preset system: built-in presets (`default`, `aggressive`, `heavy`, `extreme`), custom presets from config, preset resolution

### Out of Scope

- Clone pipeline orchestration (Story 5)
- File I/O (Story 5)
- CLI command wiring (Story 5)
- c12/zod layered configuration loading (Story 6)

## Dependencies / Prerequisites

- Story 0 must be complete (types: `StripConfig`, `StripResult`, `StripZone`, `ToolRemovalPreset`, `RolloutLine`, constants)
- Story 3 must be complete (turn boundary calculator produces `TurnInfo[]` and `TurnIdentificationResult`)

## Acceptance Criteria

**AC-5.1:** The system SHALL apply the "keep last N tool-bearing turns" model with three zones.

- **TC-5.1.1: 30 tool turns with default preset**
  - Given: 30 tool-bearing turns and preset `default` (keep=20, truncate=50%)
  - When: Stripping is applied
  - Then: 10 turns fully stripped, 10 turns truncated, 10 turns preserved at full fidelity
- **TC-5.1.2: Fewer tool turns than keep threshold**
  - Given: 5 tool-bearing turns and preset `default` (keep=20)
  - When: Stripping is applied
  - Then: 0 turns stripped (all 5 preserved since 5 < 20)

**AC-5.2:** The system SHALL remove tool call records and their paired outputs.

- **TC-5.2.1: function_call paired removal**
  - Given: A removed `function_call` with `call_id: "call_xyz"`
  - When: Stripping is applied
  - Then: The `function_call_output` with `call_id: "call_xyz"` is also removed
- **TC-5.2.2: custom_tool_call paired removal**
  - Given: A removed `custom_tool_call` with `call_id: "call_abc"`
  - When: Stripping is applied
  - Then: The `custom_tool_call_output` with `call_id: "call_abc"` is also removed
- **TC-5.2.3: local_shell_call standalone removal**
  - Given: A removed `local_shell_call`
  - When: Stripping is applied
  - Then: The record is removed (no output pairing needed)
- **TC-5.2.4: web_search_call standalone removal**
  - Given: A removed `web_search_call`
  - When: Stripping is applied
  - Then: The record is removed (no output pairing needed)

**AC-5.3:** In the truncated zone, the system SHALL truncate tool output content rather than removing it entirely.

- **TC-5.3.1: String output truncated to 120 characters**
  - Given: A `function_call_output` with a 5000-character string `output` in the truncated zone
  - When: Stripping is applied
  - Then: The output is truncated to 120 characters with `"..."` suffix
- **TC-5.3.2: ContentItem array text items truncated**
  - Given: A `function_call_output` with a `ContentItem[]` array `output` in the truncated zone
  - When: Stripping is applied
  - Then: Text items within the array are truncated
- **TC-5.3.3: function_call arguments JSON-in-JSON truncated**
  - Given: A `function_call` with a large `arguments` JSON string in the truncated zone
  - When: Stripping is applied
  - Then: The `arguments` string is parsed as JSON, string values within are truncated, and the result is re-serialized

**AC-5.4:** The system SHALL support the preset system with built-in presets.

- **TC-5.4.1: Default preset resolution**
  - Given: `--strip-tools` (no value)
  - When: Clone is run
  - Then: The `default` preset is applied (keep=20, truncate=50%)
- **TC-5.4.2: Extreme preset resolution**
  - Given: `--strip-tools=extreme`
  - When: Clone is run
  - Then: All tool calls are removed (keep=0)
- **TC-5.4.3: Heavy preset resolution**
  - Given: `--strip-tools=heavy`
  - When: Clone is run
  - Then: keep=10, truncate=80% is applied

**AC-5.5:** When all tool records in a turn are removed, the system SHALL remove the entire turn if no conversational content remains.

- **TC-5.5.1: Tool-only turn fully removed**
  - Given: A turn in the removed zone that contains only `function_call` and `function_call_output` records (no `message` records)
  - When: Stripping is applied
  - Then: The entire turn is removed including its `turn_context` and associated `event_msg` records
- **TC-5.5.2: Mixed turn preserves messages**
  - Given: A turn in the removed zone that contains both `function_call` and `message` records
  - When: Stripping is applied
  - Then: Tool records are removed but `message` records and the turn structure are preserved

**AC-6.1 (partial — TC-6.1.0 owned by Story 5, listed here for context):** The `--strip-reasoning` flag SHALL control reasoning removal independently.

- **TC-6.1.1: strip-tools without strip-reasoning defaults to full removal**
  - Given: `--strip-tools` without `--strip-reasoning`
  - When: Clone is run
  - Then: Reasoning records are removed (implicit default=`full`)
- **TC-6.1.2: strip-reasoning=none preserves reasoning**
  - Given: `--strip-tools --strip-reasoning=none`
  - When: Clone is run
  - Then: Tool records are stripped but reasoning records are preserved
- **TC-6.1.3: strip-reasoning=full without strip-tools preserves tools and telemetry**
  - Given: `--strip-reasoning=full` without `--strip-tools`
  - When: Clone is run
  - Then: Reasoning records are removed but tool records and telemetry event_msg records are preserved
- **TC-6.1.4: summary-only keeps summary, drops content**
  - Given: `--strip-reasoning=summary-only`
  - When: Clone is run
  - Then: Reasoning records are retained but `encrypted_content` and `content` fields are removed, keeping only `summary`

**AC-6.2:** The system SHALL handle both `reasoning` and `compaction` response_item subtypes.

- **TC-6.2.1: Reasoning response_item removed with full strip**
  - Given: A `response_item` of subtype `reasoning`
  - When: Full reasoning stripping is active
  - Then: The entire record is removed
- **TC-6.2.2: Compaction response_item preserved**
  - Given: A `response_item` of subtype `compaction` (inline encrypted compaction)
  - When: Stripping is active
  - Then: The record is preserved (it is a compaction artifact, not reasoning)

**AC-7.1:** When tool stripping is active, the system SHALL remove telemetry `event_msg` records.

- **TC-7.1.1: exec_command events removed**
  - Given: `event_msg` records with subtypes `exec_command_begin`, `exec_command_end`, `exec_command_output_delta`
  - When: Stripping is active
  - Then: These records are removed
- **TC-7.1.2: user_message events preserved**
  - Given: `event_msg` records with subtype `user_message`
  - When: Stripping is active
  - Then: These records are preserved
- **TC-7.1.3: error events preserved**
  - Given: `event_msg` records with subtype `error`
  - When: Stripping is active
  - Then: These records are preserved
- **TC-7.1.4: Non-preserve-list events removed**
  - Given: `event_msg` records with subtypes not in the preserve list (`token_count`, `agent_reasoning`, etc.)
  - When: Stripping is active
  - Then: These records are removed

**AC-7.2:** When tool stripping is active, the system SHALL strip `turn_context` records by zone.

- **TC-7.2.1: turn_context in removed zone removed entirely**
  - Given: A turn in the removed zone
  - When: Stripping is applied
  - Then: The `turn_context` record for that turn is removed
- **TC-7.2.2: turn_context in truncated zone removed entirely**
  - Given: A turn in the truncated zone
  - When: Stripping is applied
  - Then: The `turn_context` record for that turn is removed
- **TC-7.2.3: turn_context in preserved zone stripped of instruction fields**
  - Given: A turn in the preserved zone with a `turn_context` containing `user_instructions`, `developer_instructions`, and `collaboration_mode` fields
  - When: Stripping is applied
  - Then: The `turn_context` is retained but instruction fields are removed; structural fields (`turn_id`, `cwd`, `model`, `effort`, `approval_policy`, `sandbox_policy`, `truncation_policy`, `personality`) are preserved

**AC-7.3:** When tool stripping is active, the system SHALL remove `ghost_snapshot` records.

- **TC-7.3.1: ghost_snapshot records removed**
  - Given: `response_item` records of subtype `ghost_snapshot`
  - When: Stripping is active
  - Then: These records are removed

**AC-9.2:** The system SHALL support custom presets and default preset override.

- **TC-9.2.1: Custom preset applied when named**
  - Given: A configuration with `customPresets: { "light": { keepTurnsWithTools: 30, truncatePercent: 30 } }`
  - When: `--strip-tools=light` is used
  - Then: The custom preset values are applied
- **TC-9.2.2: Default preset overridden from config**
  - Given: A config with `defaultPreset: "aggressive"`
  - When: `--strip-tools` is used without a preset name
  - Then: The `aggressive` preset is applied instead of `default`

**AC-9.3:** The system SHALL support an `event_msg` preserve-list override in configuration.

- **TC-9.3.1: Custom preserve-list augments defaults**
  - Given: A config with `eventPreserveList: ["user_message", "error", "agent_message"]`
  - When: Stripping is active
  - Then: `agent_message` events are preserved in addition to the built-in defaults

**AC-10.1:** The system SHALL detect and preserve compacted records in the output.

- **TC-10.1.1: Top-level compacted record preserved**
  - Given: A session with a top-level `compacted` record
  - When: Clone is run with `--strip-tools`
  - Then: The `compacted` record is present in the output unchanged
- **TC-10.1.2: Compaction response_item preserved**
  - Given: A session with a `response_item` of subtype `compaction`
  - When: Clone is run with `--strip-tools`
  - Then: The `compaction` response_item is present in the output unchanged

**AC-10.3:** The system SHALL apply stripping effectively to post-compaction tool-bearing turns.

- **TC-10.3.1: Compacted session with fewer turns than keep threshold**
  - Given: A compacted session with 15 post-compaction tool-bearing turns and preset `default` (keep=20)
  - When: Stripping is applied
  - Then: All 15 turns are preserved (since 15 < 20) but reasoning and telemetry are still stripped
- **TC-10.3.2: Compacted session with zone split**
  - Given: A compacted session with 40 post-compaction tool-bearing turns and preset `default`
  - When: Stripping is applied
  - Then: 20 turns are stripped, 10 truncated, 10 preserved

## Error Paths

| Scenario | Expected Response |
|----------|------------------|
| Unknown preset name | `ConfigurationError` listing available presets |
| Zero tool-bearing turns with tool stripping active | Clone proceeds (reasoning/telemetry still stripped), warning emitted |
| `function_call` arguments not valid JSON | Preserve arguments as-is in truncated zone (defensive fallback) |

## Definition of Done

- [ ] All ACs met
- [ ] All TC conditions verified (35 TCs)
- [ ] `stripRecords()` does not mutate input arrays or records
- [ ] All four tool call types handled with correct pairing behavior
- [ ] Preset resolution covers built-in and custom presets
- [ ] PO accepts

---

## Technical Implementation

### Architecture Context

This story implements the core algorithmic engine of cxs-cloner: the `record-stripper` module. This is the most complex module and the largest test surface in the project (~800-1000 lines of tests). It also implements the preset resolution functions that were stubbed in Story 0.

The record-stripper is a pure function — it takes records, turn info, pre-turn range, and strip config as inputs, and returns a new record array with statistics. It does NOT mutate its inputs. Zone assignment on turns is internal — the stripper creates copies of `TurnInfo` objects with zones assigned for processing.

**Modules and Responsibilities:**

| Module | Path | Responsibility | AC Coverage |
|--------|------|----------------|-------------|
| `record-stripper` | `src/core/record-stripper.ts` | Zone-based stripping: tool calls, reasoning, telemetry, turn_context, ghost_snapshots. Handles pairing, truncation, empty turn removal, compacted record preservation. | AC-5.1–5.5, AC-6.1–6.2, AC-7.1–7.3, AC-9.3, AC-10.1, AC-10.3 |
| `tool-removal-presets` | `src/config/tool-removal-presets.ts` | Implement preset resolution functions (stubbed in Story 0): `resolvePreset`, `isValidPresetName`, `listAvailablePresets` | AC-5.4, AC-9.2 |

**The Zone Model (from Tech Design §Flow 3 — The Zone Model):**

The stripping algorithm operates on tool-bearing turns only. Non-tool-bearing turns pass through unchanged (except for reasoning and telemetry stripping which apply globally). The algorithm assigns each tool-bearing turn to one of three zones:

```
Tool-bearing turns (chronological order):
┌──────────┬──────────────┬────────────────┐
│ REMOVED  │  TRUNCATED   │   PRESERVED    │
│ (oldest) │  (middle)    │   (newest)     │
│          │              │                │
│ Drop all │ Keep calls,  │ Keep everything│
│ tool     │ truncate     │ at full        │
│ records  │ output       │ fidelity       │
│          │ content      │                │
└──────────┴──────────────┴────────────────┘
          ◀─────── keepTurnsWithTools ──────▶
                   ◀─ truncate% ─▶
```

**Zone calculation from preset parameters:**
- `keepTurnsWithTools`: how many tool-bearing turns to retain (from the end)
- `truncatePercent`: what fraction of retained turns get truncated (from the older end of retained)
- Turns beyond `keepTurnsWithTools` (counted from newest) → **removed zone**
- Of retained turns, `Math.floor(truncatePercent / 100 * kept)` oldest → **truncated zone**
- Remaining retained turns → **preserved zone**

Example with 30 tool-bearing turns, `default` preset (keep=20, truncate=50%):
- 10 oldest → removed (30 - 20 = 10)
- 10 middle → truncated (floor(50% × 20) = 10)
- 10 newest → preserved (20 - 10 = 10)

**Record Stripping Algorithm (from Tech Design §Low Altitude — Record Stripper):**

The `stripRecords` function proceeds in six stages:

1. **Compute zones:** Assign each tool-bearing turn to removed/truncated/preserved based on preset parameters.

2. **For removed zone turns:**
   a. Collect `call_id` values from tool call records (`function_call`, `custom_tool_call`)
   b. Remove all tool records (`function_call`, `local_shell_call`, `custom_tool_call`, `web_search_call`)
   c. Remove matching tool output records (`function_call_output` by `call_id`, `custom_tool_call_output` by `call_id`)
   d. If turn has no remaining conversational content → remove entire turn (including `turn_context` and associated `event_msg` records)

3. **For truncated zone turns:**
   a. Truncate tool output content:
      - `function_call_output.output` (string form) → truncate to `truncateLength` chars (default 120) with `"..."` suffix
      - `function_call_output.output` (ContentItem[] form) → truncate text items within the array
      - Same applies to `custom_tool_call_output.output` (shared utility for both)
   b. Truncate `function_call.arguments`:
      - Parse JSON string → truncate string values within → re-serialize
      - If arguments is not valid JSON → preserve as-is (defensive fallback)

4. **Apply reasoning stripping globally (mode-dependent):**
   - `"full"` → remove all `reasoning` response_items
   - `"summary-only"` → keep `summary` field, remove `content` and `encrypted_content` fields
   - `"none"` → preserve as-is
   - `compaction` response_items are NEVER treated as reasoning — always preserved

5. **If tool stripping is active (`stripConfig.stripTools === true`):**
   a. Strip `event_msg` records not in `eventPreserveList` (default: `user_message`, `error`)
   b. Strip `turn_context` records per zone:
      - Removed zone: remove entire `turn_context` record
      - Truncated zone: remove entire `turn_context` record
      - Preserved zone: keep structural fields (`TURN_CONTEXT_STRUCTURAL_FIELDS`), strip instruction fields (`user_instructions`, `instructions`, `developer_instructions`, `collaboration_mode`)
   c. Remove `ghost_snapshot` response_items

6. **Remove empty turns:** Turns with no remaining records after stripping are removed entirely.

**Critical: telemetry/context/ghost stripping is gated on `stripTools`.**
When `--strip-reasoning=full` is used WITHOUT `--strip-tools`, only reasoning records are removed. Telemetry events, `turn_context` records, and `ghost_snapshot` records are NOT stripped. This is because telemetry stripping only makes sense in the context of tool stripping — stripping telemetry without stripping tools would break the session context.

**Tool Call Pairing Rules:**

| Tool Type | Paired Output | Linking | Behavior |
|-----------|--------------|---------|----------|
| `function_call` | `function_call_output` | by `call_id` | Remove both in removed zone; truncate output in truncated zone |
| `custom_tool_call` | `custom_tool_call_output` | by `call_id` | Remove both in removed zone; truncate output in truncated zone |
| `local_shell_call` | None (output via `event_msg`) | Standalone | Remove record only in removed zone |
| `web_search_call` | None | Standalone | Remove record only in removed zone |

**Truncation Details:**

The `output` field on `function_call_output` and `custom_tool_call_output` is an untagged union — either a plain `string` or an array of `ContentItem`. Truncation logic must handle both forms:

- **String output:** If length > `truncateLength`, truncate to `truncateLength` characters and append `"..."`.
- **ContentItem[] output:** Iterate items. For items with a `text` field (`input_text`, `output_text`), apply the same truncation to the `text` field. `input_image` items are preserved as-is.

The `arguments` field on `function_call` is a JSON-encoded string. Truncation:
1. Parse the JSON string into an object
2. Walk the object, truncating any string values that exceed `truncateLength`
3. Re-serialize to JSON string
4. If parse fails (invalid JSON), preserve arguments as-is (defensive fallback)

**Preset Resolution:**

```typescript
// src/config/tool-removal-presets.ts

export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = {
  default: { keepTurnsWithTools: 20, truncatePercent: 50 },
  aggressive: { keepTurnsWithTools: 10, truncatePercent: 70 },
  heavy: { keepTurnsWithTools: 10, truncatePercent: 80 },
  extreme: { keepTurnsWithTools: 0, truncatePercent: 0 },
};

export function resolvePreset(
  presetName: string,
  customPresets?: Record<string, ToolRemovalPreset>,
): ToolRemovalPreset;
// Checks custom presets first, then built-in.
// Throws ConfigurationError if not found, listing available presets.

export function isValidPresetName(
  name: string,
  customPresets?: Record<string, ToolRemovalPreset>,
): boolean;

export function listAvailablePresets(
  customPresets?: Record<string, ToolRemovalPreset>,
): string[];
```

### Interfaces & Contracts

**Creates:**

```typescript
// src/core/record-stripper.ts
import type { RolloutLine } from "../types/codex-session-types.js";
import type { TurnInfo, StripResult } from "../types/clone-operation-types.js";
import type { StripConfig } from "../types/tool-removal-types.js";

/**
 * Apply zone-based stripping to session records.
 *
 * Does NOT mutate the input arrays, records, or TurnInfo objects.
 * Returns a new record array (deep clone before mutation) and statistics.
 */
export function stripRecords(
  records: RolloutLine[],
  turns: TurnInfo[],
  preTurnRange: { startIndex: number; endIndex: number },
  config: StripConfig,
): StripResult;
```

**Implements (from Story 0 stubs):**

```typescript
// src/config/tool-removal-presets.ts
export function resolvePreset(
  presetName: string,
  customPresets?: Record<string, ToolRemovalPreset>,
): ToolRemovalPreset;

export function isValidPresetName(
  name: string,
  customPresets?: Record<string, ToolRemovalPreset>,
): boolean;

export function listAvailablePresets(
  customPresets?: Record<string, ToolRemovalPreset>,
): string[];
```

**Consumes (from Story 0):**

```typescript
// src/types/tool-removal-types.ts
export interface StripConfig {
  toolPreset: ToolRemovalPreset | null;
  reasoningMode: ReasoningMode;
  stripTools: boolean;
  eventPreserveList: readonly string[];
  truncateLength: number;
}

export type StripZone = "removed" | "truncated" | "preserved";

export interface ToolRemovalPreset {
  keepTurnsWithTools: number;
  truncatePercent: number;
}

export type ReasoningMode = "full" | "summary-only" | "none";

// src/types/clone-operation-types.ts
export interface TurnInfo {
  startIndex: number;
  endIndex: number;
  turnIndex: number;
  isToolBearing: boolean;
  zone: StripZone | null;
}

export interface StripResult {
  records: RolloutLine[];
  statistics: Omit<CloneStatistics, "fileSizeReductionPercent" | "originalSizeBytes" | "outputSizeBytes">;
}

// src/types/codex-session-types.ts
export const TURN_CONTEXT_STRUCTURAL_FIELDS = [...] as const;
export const DEFAULT_EVENT_PRESERVE_LIST: readonly string[] = [...] as const;

// src/config/tool-removal-presets.ts
export const DEFAULT_TRUNCATE_LENGTH = 120;
export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = { ... };

// All payload interfaces from codex-session-types.ts for record discrimination
```

**Consumes (from Story 3):**

```typescript
// src/core/turn-boundary-calculator.ts
export function identifyTurns(records: RolloutLine[]): TurnIdentificationResult;
// Called by clone-operation-executor (Story 5), not directly by record-stripper.
// Record-stripper receives the already-computed turns as input.
```

### TC -> Test Mapping

**Zone computation (AC-5.1):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-5.1.1 | `test/core/record-stripper.test.ts` | TC-5.1.1: 30 tool turns default preset → 10 removed, 10 truncated, 10 preserved | Build 30 tool-bearing turns via SessionBuilder. Call `stripRecords` with default preset (keep=20, truncate=50%). Assert zone distribution: 10 removed, 10 truncated, 10 preserved. Verify record counts match expectations. |
| TC-5.1.2 | `test/core/record-stripper.test.ts` | TC-5.1.2: 5 tool turns default preset → all preserved | Build 5 tool-bearing turns. Call `stripRecords` with default preset. Assert 0 removed, all 5 preserved (5 < 20). |

**Tool call pairing (AC-5.2):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-5.2.1 | `test/core/record-stripper.test.ts` | TC-5.2.1: removes function_call and paired function_call_output | Build turn in removed zone with `function_call` (call_id="call_xyz") and `function_call_output` (call_id="call_xyz"). Call `stripRecords`. Assert both records removed. |
| TC-5.2.2 | `test/core/record-stripper.test.ts` | TC-5.2.2: removes custom_tool_call and paired custom_tool_call_output | Build turn in removed zone with `custom_tool_call` and `custom_tool_call_output` sharing same call_id. Call `stripRecords`. Assert both removed. |
| TC-5.2.3 | `test/core/record-stripper.test.ts` | TC-5.2.3: removes standalone local_shell_call | Build turn in removed zone with `local_shell_call`. Call `stripRecords`. Assert record removed (no pairing needed). |
| TC-5.2.4 | `test/core/record-stripper.test.ts` | TC-5.2.4: removes standalone web_search_call | Build turn in removed zone with `web_search_call`. Call `stripRecords`. Assert record removed (no pairing needed). |

**Truncation (AC-5.3):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-5.3.1 | `test/core/record-stripper.test.ts` | TC-5.3.1: truncates function_call_output string to 120 chars | Build turn in truncated zone with `function_call_output` having 5000-char string `output`. Call `stripRecords`. Assert output ≤ 123 chars (120 + "..."). |
| TC-5.3.2 | `test/core/record-stripper.test.ts` | TC-5.3.2: truncates ContentItem array text items | Build turn in truncated zone with `function_call_output` having `ContentItem[]` output with long text items. Call `stripRecords`. Assert text within items truncated. |
| TC-5.3.3 | `test/core/record-stripper.test.ts` | TC-5.3.3: truncates function_call arguments JSON-in-JSON | Build turn in truncated zone with `function_call` having large `arguments` JSON string with long string values. Call `stripRecords`. Assert arguments parsed, string values truncated, re-serialized. |

**Preset system (AC-5.4):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-5.4.1 | `test/config/tool-removal-presets.test.ts` | TC-5.4.1: no preset value resolves to default | Call `resolvePreset("default")`. Assert `{ keepTurnsWithTools: 20, truncatePercent: 50 }`. |
| TC-5.4.2 | `test/config/tool-removal-presets.test.ts` | TC-5.4.2: extreme preset → keep=0 | Call `resolvePreset("extreme")`. Assert `{ keepTurnsWithTools: 0, truncatePercent: 0 }`. |
| TC-5.4.3 | `test/config/tool-removal-presets.test.ts` | TC-5.4.3: heavy preset → keep=10, truncate=80% | Call `resolvePreset("heavy")`. Assert `{ keepTurnsWithTools: 10, truncatePercent: 80 }`. |

**Empty turn removal (AC-5.5):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-5.5.1 | `test/core/record-stripper.test.ts` | TC-5.5.1: removes entire tool-only turn in removed zone | Build turn in removed zone with only `function_call` + `function_call_output` (no `message` records). Call `stripRecords`. Assert entire turn removed including `turn_context` and `event_msg`. |
| TC-5.5.2 | `test/core/record-stripper.test.ts` | TC-5.5.2: preserves messages in turn with mixed content | Build turn in removed zone with `function_call` AND `message` records. Call `stripRecords`. Assert tool records removed, `message` records preserved, turn structure kept. |

**Reasoning stripping (AC-6.1, AC-6.2):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-6.1.1 | `test/core/record-stripper.test.ts` | TC-6.1.1: strip-tools without strip-reasoning defaults to full removal | Build session with tool and reasoning records. Call `stripRecords` with `stripTools: true, reasoningMode: "full"`. Assert reasoning records absent. |
| TC-6.1.2 | `test/core/record-stripper.test.ts` | TC-6.1.2: strip-reasoning=none preserves reasoning | Build session with tools and reasoning. Call `stripRecords` with `stripTools: true, reasoningMode: "none"`. Assert reasoning records present. |
| TC-6.1.3 | `test/core/record-stripper.test.ts` | TC-6.1.3: strip-reasoning=full without strip-tools removes reasoning, preserves tools and telemetry | Build session with reasoning, tools, and `event_msg` records. Call `stripRecords` with `stripTools: false, reasoningMode: "full"`. Assert reasoning gone, tools present, `event_msg` records preserved. |
| TC-6.1.4 | `test/core/record-stripper.test.ts` | TC-6.1.4: summary-only keeps summary, drops content | Build reasoning record with `summary`, `content`, `encrypted_content`. Call `stripRecords` with `reasoningMode: "summary-only"`. Assert `summary` present, `content` and `encrypted_content` absent. |
| TC-6.2.1 | `test/core/record-stripper.test.ts` | TC-6.2.1: removes reasoning response_item with full strip | Build `reasoning` response_item. Call `stripRecords` with `reasoningMode: "full"`. Assert record removed. |
| TC-6.2.2 | `test/core/record-stripper.test.ts` | TC-6.2.2: preserves compaction response_item (not reasoning) | Build `compaction` response_item. Call `stripRecords` with `reasoningMode: "full"`. Assert record preserved (compaction ≠ reasoning). |

**Telemetry stripping (AC-7.1):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-7.1.1 | `test/core/record-stripper.test.ts` | TC-7.1.1: removes exec_command events when active | Build `event_msg` records with subtypes `exec_command_begin`, `exec_command_end`, `exec_command_output_delta`. Call `stripRecords` with `stripTools: true`. Assert records removed. |
| TC-7.1.2 | `test/core/record-stripper.test.ts` | TC-7.1.2: preserves user_message events | Build `event_msg` with subtype `user_message`. Call `stripRecords` with `stripTools: true`. Assert record preserved. |
| TC-7.1.3 | `test/core/record-stripper.test.ts` | TC-7.1.3: preserves error events | Build `event_msg` with subtype `error`. Call `stripRecords` with `stripTools: true`. Assert record preserved. |
| TC-7.1.4 | `test/core/record-stripper.test.ts` | TC-7.1.4: removes non-preserve-list events | Build `event_msg` records with subtypes `token_count`, `agent_reasoning`. Call `stripRecords` with `stripTools: true`. Assert records removed. |

**Turn context stripping (AC-7.2):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-7.2.1 | `test/core/record-stripper.test.ts` | TC-7.2.1: removes turn_context in removed zone | Build turn in removed zone. Call `stripRecords` with `stripTools: true`. Assert `turn_context` record absent. |
| TC-7.2.2 | `test/core/record-stripper.test.ts` | TC-7.2.2: removes turn_context in truncated zone | Build turn in truncated zone. Call `stripRecords` with `stripTools: true`. Assert `turn_context` record absent. |
| TC-7.2.3 | `test/core/record-stripper.test.ts` | TC-7.2.3: strips instruction fields from preserved zone turn_context | Build turn in preserved zone with `turn_context` containing `user_instructions`, `developer_instructions`, `collaboration_mode`, plus structural fields. Call `stripRecords` with `stripTools: true`. Assert structural fields present (`turn_id`, `cwd`, `model`, etc.), instruction fields absent. |

**Ghost snapshot stripping (AC-7.3):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-7.3.1 | `test/core/record-stripper.test.ts` | TC-7.3.1: removes ghost_snapshot records | Build `ghost_snapshot` response_item. Call `stripRecords` with `stripTools: true`. Assert record removed. |

**Custom presets and config (AC-9.2, AC-9.3):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-9.2.1 | `test/config/tool-removal-presets.test.ts` | TC-9.2.1: custom preset applied when named | Call `resolvePreset("light", { light: { keepTurnsWithTools: 30, truncatePercent: 30 } })`. Assert custom values returned. |
| TC-9.2.2 | `test/config/tool-removal-presets.test.ts` | TC-9.2.2: defaultPreset from config used when no preset named | Verify that when `defaultPreset: "aggressive"` is in config, `resolvePreset("aggressive")` returns the aggressive preset values. |
| TC-9.3.1 | `test/core/record-stripper.test.ts` | TC-9.3.1: custom eventPreserveList augments built-in list | Build `event_msg` with subtype `agent_message`. Call `stripRecords` with `eventPreserveList: ["user_message", "error", "agent_message"]`. Assert `agent_message` event preserved. |

**Compaction handling (AC-10.1, AC-10.3):**

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-10.1.1 | `test/core/record-stripper.test.ts` | TC-10.1.1: preserves top-level compacted record in output | Build session with top-level `compacted` record. Call `stripRecords`. Assert `compacted` record present in output unchanged. |
| TC-10.1.2 | `test/core/record-stripper.test.ts` | TC-10.1.2: preserves compaction response_item in output | Build session with `compaction` response_item. Call `stripRecords`. Assert record present in output unchanged. |
| TC-10.3.1 | `test/core/record-stripper.test.ts` | TC-10.3.1: compacted + 15 tool turns keep=20 → all preserved | Build compacted session with 15 post-compaction tool-bearing turns. Call `stripRecords` with default preset (keep=20). Assert 0 removed (15 < 20). |
| TC-10.3.2 | `test/core/record-stripper.test.ts` | TC-10.3.2: compacted + 40 tool turns default → correct zone split | Build compacted session with 40 post-compaction tool-bearing turns. Call `stripRecords` with default preset. Assert 20 removed, 10 truncated, 10 preserved. |

### Non-TC Decided Tests

| Test File | Test Description | Source |
|-----------|------------------|--------|
| `test/core/record-stripper.test.ts` | Truncation of already-short content (no-op) | Tech Design §Chunk 4 Non-TC Decided Tests |
| `test/core/record-stripper.test.ts` | Truncation of empty arguments string | Tech Design §Chunk 4 Non-TC Decided Tests |
| `test/core/record-stripper.test.ts` | Tool call with missing call_id (defensive handling) | Tech Design §Chunk 4 Non-TC Decided Tests |
| `test/core/record-stripper.test.ts` | Mixed zone types in single pass (verify all zones applied correctly in one call) | Tech Design §Chunk 4 Non-TC Decided Tests |
| `test/core/record-stripper.test.ts` | Reasoning-only stripping with no tool turns (stripTools=false, reasoningMode=full, zero tool turns) | Tech Design §Chunk 4 Non-TC Decided Tests |

### Risks & Constraints

- **Input immutability:** `stripRecords()` must NOT mutate input arrays or records. Deep clone records before mutation. This is a design invariant from the tech design — the executor may need the original records for statistics comparison.
- **JSON-in-JSON truncation:** The `arguments` field on `function_call` is a JSON-encoded string. Parsing can fail if the string is malformed JSON (edge case). Defensive fallback: preserve as-is.
- **Untagged union for `output`:** The `output` field on `function_call_output` and `custom_tool_call_output` is `string | ContentItem[]`. Runtime type checking is required — `typeof output === "string"` vs. `Array.isArray(output)`.
- **`local_shell_call` always standalone:** Even if `call_id` is present on the record, it's treated as standalone — no pairing with output records. Outputs are conveyed via `event_msg` records which are stripped separately.
- **Compacted records inside `replacement_history`:** The `replacement_history` array inside `CompactedPayload` may contain tool call records. These are NOT re-analyzed or stripped — the entire compacted record is preserved as-is.
- **Empty turn detection:** After stripping tool records, a turn may have only `turn_context` and `event_msg` records remaining — no conversational content. These turns should be removed entirely. The check is: after removing tool records, reasoning, and telemetry from a turn, does it have any remaining `response_item` records of type `message`?

### Spec Deviation

None. Checked against Tech Design: §Flow 3 — The Zone Model, §Flow 3 — Record Stripping sub-section (all 6 stages), §Low Altitude — StripConfig/StripResult interfaces, §Low Altitude — Record Stripper entry point (full algorithm doc), §Low Altitude — Preset Definitions, §Module Responsibility Matrix (record-stripper, presets rows), §Chunk 4 scope and TC mapping.

## Technical Checklist

- [ ] All TCs have passing tests (35 TCs)
- [ ] Non-TC decided tests pass (5 tests)
- [ ] `stripRecords()` does not mutate input arrays or records
- [ ] All four tool call types handled with correct pairing
- [ ] Both `output` union forms handled (string and ContentItem[])
- [ ] Arguments JSON-in-JSON truncation with fallback
- [ ] Preset resolution covers built-in and custom presets
- [ ] TypeScript compiles clean (`bun run typecheck`)
- [ ] Lint/format passes (`bun run format:check && bun run lint`)
- [ ] No regressions on Stories 0-3 (`bun test`)
- [ ] Verification: `bun run verify`
- [ ] Spec deviations documented (if any)
