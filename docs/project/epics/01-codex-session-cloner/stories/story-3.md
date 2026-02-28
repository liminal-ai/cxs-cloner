# Story 3: Turn Boundary Identification

## Objective

After this story ships, the system can analyze any Codex session and correctly identify its turn structure: where each turn begins and ends, which turns contain tool calls, how pre-turn records (before the first `turn_context`) are handled, and how compaction boundaries affect turn identification. This is the prerequisite for zone-based stripping in Story 4.

## Scope

### In Scope

- Turn boundary detection from `turn_context` records (each `turn_context` starts a new turn)
- Pre-turn record identification (records before the first qualifying `turn_context` — always preserved)
- Compaction boundary handling (only `turn_context` records after the last `compacted` record define turns)
- Mid-turn compaction edge case (pre-compaction `turn_context` records treated as pre-turn context)
- Tool-bearing turn classification (turns containing `function_call`, `local_shell_call`, `custom_tool_call`, or `web_search_call` records)

### Out of Scope

- Zone assignment to turns (Story 4 — the record-stripper assigns zones during stripping)
- Record stripping or truncation (Story 4)
- Clone pipeline orchestration (Story 5)

## Dependencies / Prerequisites

- Story 0 must be complete (types: `TurnInfo`, `TurnIdentificationResult`, `RolloutLine`)
- Story 2 must be complete (JSONL parser that produces `RolloutLine[]` for input)

## Acceptance Criteria

**AC-4.1:** The system SHALL identify turn boundaries from `turn_context` records.

- **TC-4.1.1: Turn boundaries from turn_context positions**
  - Given: A session with 3 `turn_context` records at lines 5, 20, and 40
  - When: Turns are identified
  - Then: 3 turns are found with boundaries [5-19], [20-39], [40-end]
- **TC-4.1.2: Turns bounded by turn_context not event_msg**
  - Given: A session with `event_msg` of subtype `user_message` appearing between `turn_context` records
  - When: Turns are identified
  - Then: Turns are bounded by `turn_context` records (not event messages)

**AC-4.2:** The system SHALL handle pre-turn records.

- **TC-4.2.1: Pre-turn records preserved unconditionally**
  - Given: A session where `session_meta` and initial `response_item` records appear before any `turn_context`
  - When: Turns are identified
  - Then: These pre-turn records are preserved unconditionally and are not assigned to any turn

**AC-4.3:** The system SHALL handle sessions with compacted records.

- **TC-4.3.1: Only post-compaction turns identified**
  - Given: A session with a `compacted` record at line 10 followed by 5 `turn_context` records
  - When: Turns are identified
  - Then: Turns are identified only for the post-compaction portion
- **TC-4.3.2: Mid-turn compaction handled correctly**
  - Given: A session where a `turn_context` appears, then compaction occurs, then another `turn_context` appears within the same logical turn
  - When: Turns are identified
  - Then: Only the post-compaction `turn_context` records define turns (pre-compaction records are treated as pre-turn context)

**AC-4.4:** The system SHALL identify which turns contain tool calls.

- **TC-4.4.1: Turn with function_call classified as tool-bearing**
  - Given: A turn containing `response_item` records with subtypes `function_call` and `function_call_output`
  - When: The turn is analyzed
  - Then: It is classified as tool-bearing
- **TC-4.4.2: Turn with only messages not tool-bearing**
  - Given: A turn containing only `message` and `reasoning` subtypes
  - When: The turn is analyzed
  - Then: It is NOT classified as tool-bearing
- **TC-4.4.3: Turn with other tool types classified as tool-bearing**
  - Given: A turn containing `local_shell_call`, `custom_tool_call`, or `web_search_call` subtypes
  - When: The turn is analyzed
  - Then: It IS classified as tool-bearing

## Error Paths

| Scenario | Expected Response |
|----------|------------------|
| Session with zero `turn_context` records | All records classified as pre-turn; empty turns array |
| Session with `turn_context` only before compaction | All records classified as pre-turn (post-compaction has no turns) |

## Definition of Done

- [ ] All ACs met
- [ ] All TC conditions verified
- [ ] `identifyTurns()` correctly handles fresh sessions, compacted sessions, and edge cases
- [ ] PO accepts

---

## Technical Implementation

### Architecture Context

This story implements the turn boundary calculator — a pure function that takes a `RolloutLine[]` array and produces a `TurnIdentificationResult` describing the turn structure: where each turn starts and ends, which turns contain tool calls, and how compaction boundaries affect turn identification. This is the prerequisite for zone-based stripping in Story 4.

**Module:**

| Module | Path | Responsibility | AC Coverage |
|--------|------|----------------|-------------|
| `turn-boundary-calculator` | `src/core/turn-boundary-calculator.ts` | Identify turn boundaries from `turn_context` records, handle pre-turn records and compaction boundaries, classify tool-bearing turns | AC-4.1, AC-4.2, AC-4.3, AC-4.4 |

**How it fits in the clone pipeline (from Tech Design §Flow 3):**

```
clone-operation-executor
    │
    ├── scanner (find session)
    ├── reader (parse JSONL → RolloutLine[])
    │
    ├── turn-boundary-calculator ◄── THIS STORY
    │   Input: RolloutLine[]
    │   Output: TurnIdentificationResult
    │       ├── preTurnRecords: { startIndex, endIndex }
    │       ├── turns: TurnInfo[]
    │       ├── compactionDetected: boolean
    │       └── lastCompactionIndex: number | null
    │
    ├── record-stripper (Story 4 — consumes TurnIdentificationResult)
    └── writer (Story 5)
```

**Turn Boundary Algorithm (from Tech Design §Flow 3 and §Low Altitude — Turn Boundary Calculator):**

The algorithm proceeds in five steps:

1. **Scan for compacted records:** Iterate all records, note the position of the last `compacted` record (top-level `type: "compacted"`). This determines where "real" turn identification begins.

2. **Identify qualifying turn_context records:** Only `turn_context` records AFTER the last compaction record define turns. Any `turn_context` records before or at the compaction boundary are treated as pre-turn context (they're part of the compacted history).

3. **Build turn boundaries:** Each qualifying `turn_context` record starts a new turn. The turn extends from the `turn_context` record to the next `turn_context` or the end of the array. Boundaries use exclusive `endIndex` — turn N ends at the start of turn N+1.

4. **Identify pre-turn records:** Everything before the first qualifying `turn_context` (including `session_meta`, initial `response_items`, compacted records, and any pre-compaction `turn_context` records) is classified as "pre-turn." Pre-turn records are always preserved unconditionally during stripping.

5. **Classify tool-bearing turns:** For each turn, scan the records in its range [startIndex, endIndex). If any `response_item` has a payload subtype that is a tool call type (`function_call`, `local_shell_call`, `custom_tool_call`, or `web_search_call`), the turn is classified as `isToolBearing: true`. Note: `function_call_output`, `custom_tool_call_output` are NOT counted as tool-call types for classification — they are paired outputs.

**Compaction boundary edge cases:**

```
Case 1: Simple compaction
  session_meta → messages → compacted → turn_context → ...
  Pre-turn: [session_meta, messages, compacted]
  Turns: start from first turn_context after compacted

Case 2: Mid-turn compaction
  session_meta → turn_context_A → messages → compacted → turn_context_B → ...
  Pre-turn: [session_meta, turn_context_A, messages, compacted]
  Turns: start from turn_context_B only
  (turn_context_A is before compaction, so it's pre-turn)

Case 3: No compaction
  session_meta → turn_context → ...
  Pre-turn: [session_meta] (everything before first turn_context)
  Turns: start from first turn_context
```

**Tool-bearing classification:**

The following `response_item` subtypes classify a turn as tool-bearing:
- `function_call` — paired with `function_call_output` by `call_id`
- `local_shell_call` — standalone (output via `event_msg`)
- `custom_tool_call` — paired with `custom_tool_call_output` by `call_id`
- `web_search_call` — standalone (no paired output)

Subtypes that do NOT make a turn tool-bearing: `message`, `reasoning`, `function_call_output`, `custom_tool_call_output`, `ghost_snapshot`, `compaction`, unknown subtypes.

### Interfaces & Contracts

**Creates:**

```typescript
// src/core/turn-boundary-calculator.ts
import type { RolloutLine } from "../types/codex-session-types.js";
import type { TurnIdentificationResult } from "../types/clone-operation-types.js";

/**
 * Identify turn boundaries from turn_context records.
 *
 * Algorithm:
 * 1. Scan records for compacted records (note position of last one)
 * 2. Only consider turn_context records AFTER the last compaction
 * 3. Each turn_context starts a new turn, ending at the next turn_context or array end
 * 4. Records before the first qualifying turn_context are "pre-turn" (always preserved)
 * 5. Classify each turn as tool-bearing based on response_item subtypes within
 *
 * Does NOT mutate the input array.
 * Does NOT assign zones — that's record-stripper's job (Story 4).
 * The zone field on returned TurnInfo objects is null.
 */
export function identifyTurns(records: RolloutLine[]): TurnIdentificationResult;
```

**Consumes (from Story 0):**

```typescript
// src/types/codex-session-types.ts
export interface RolloutLine {
  timestamp: string;
  type: RolloutType;
  payload: RolloutPayload;
}

export type RolloutType =
  | "session_meta"
  | "response_item"
  | "turn_context"
  | "event_msg"
  | "compacted";

// Used for tool-bearing classification:
export type ResponseItemPayload =
  | FunctionCallPayload      // type: "function_call" → tool-bearing
  | LocalShellCallPayload    // type: "local_shell_call" → tool-bearing
  | CustomToolCallPayload    // type: "custom_tool_call" → tool-bearing
  | WebSearchCallPayload     // type: "web_search_call" → tool-bearing
  | MessagePayload           // NOT tool-bearing
  | ReasoningPayload         // NOT tool-bearing
  | ...;

// src/types/clone-operation-types.ts
export interface TurnInfo {
  startIndex: number;   // Index of turn_context record
  endIndex: number;     // Exclusive — start of next turn or records.length
  turnIndex: number;    // 0-based sequential
  isToolBearing: boolean;
  zone: StripZone | null; // Always null from identifyTurns
}

export interface TurnIdentificationResult {
  preTurnRecords: { startIndex: number; endIndex: number };
  turns: TurnInfo[];
  compactionDetected: boolean;
  lastCompactionIndex: number | null;
}
```

### TC -> Test Mapping

| TC | Test File | Test Description | Approach |
|----|-----------|------------------|----------|
| TC-4.1.1 | `test/core/turn-boundary-calculator.test.ts` | TC-4.1.1: identifies turns from turn_context positions | Build records with `turn_context` at indices 5, 20, 40 (using SessionBuilder). Call `identifyTurns`. Assert 3 turns with boundaries [5, 20), [20, 40), [40, N) using exclusive `endIndex`. |
| TC-4.1.2 | `test/core/turn-boundary-calculator.test.ts` | TC-4.1.2: bounds turns by turn_context not event_msg | Build records with `user_message` `event_msg` between `turn_context` records. Call `identifyTurns`. Assert turns bounded by `turn_context`, not by event messages. |
| TC-4.2.1 | `test/core/turn-boundary-calculator.test.ts` | TC-4.2.1: preserves pre-turn records | Build records with `session_meta` + initial `response_item` records before first `turn_context`. Call `identifyTurns`. Assert `preTurnRecords` populated with correct `startIndex`/`endIndex`. |
| TC-4.3.1 | `test/core/turn-boundary-calculator.test.ts` | TC-4.3.1: identifies only post-compaction turns | Build records with `compacted` record followed by 5 `turn_context` records. Call `identifyTurns`. Assert 5 turns identified. Assert pre-compaction records (including the compacted record) are in `preTurnRecords`. Assert `compactionDetected: true`. |
| TC-4.3.2 | `test/core/turn-boundary-calculator.test.ts` | TC-4.3.2: handles mid-turn compaction | Build records: `turn_context` → records → `compacted` → `turn_context`. Call `identifyTurns`. Assert only the post-compaction `turn_context` defines a turn boundary. Pre-compaction `turn_context` is in `preTurnRecords`. |
| TC-4.4.1 | `test/core/turn-boundary-calculator.test.ts` | TC-4.4.1: classifies turn with function_call as tool-bearing | Build turn containing `function_call` and `function_call_output` records. Call `identifyTurns`. Assert `isToolBearing: true`. |
| TC-4.4.2 | `test/core/turn-boundary-calculator.test.ts` | TC-4.4.2: classifies message-only turn as non-tool-bearing | Build turn with only `message` and `reasoning` records. Call `identifyTurns`. Assert `isToolBearing: false`. |
| TC-4.4.3 | `test/core/turn-boundary-calculator.test.ts` | TC-4.4.3: classifies turn with other tool types as tool-bearing | Build separate turns with `local_shell_call`, `custom_tool_call`, `web_search_call`. Call `identifyTurns`. Assert `isToolBearing: true` for each. |

### Non-TC Decided Tests

| Test File | Test Description | Source |
|-----------|------------------|--------|
| `test/core/turn-boundary-calculator.test.ts` | Session with zero turns (only pre-turn records) returns empty turns array | Tech Design §Chunk 3 Non-TC Decided Tests |
| `test/core/turn-boundary-calculator.test.ts` | Session with 100+ turns (performance sanity check) | Tech Design §Chunk 3 Non-TC Decided Tests |
| `test/core/turn-boundary-calculator.test.ts` | Consecutive turn_context records with no content between them | Tech Design §Chunk 3 Non-TC Decided Tests |

### Risks & Constraints

- The algorithm relies on `turn_context` records being the reliable turn boundary markers. If Codex changes how `turn_context` records are emitted (e.g., not emitting them in some modes), turn detection would fail. Validated against Codex protocol source.
- Mid-turn compaction is an edge case where a `turn_context` appears, then compaction occurs within that same logical turn, then another `turn_context` appears. The algorithm handles this by treating only post-compaction `turn_context` records as boundaries, but untested edge cases may exist with complex compaction patterns.
- The `zone` field on returned `TurnInfo` objects is always `null` — zone assignment happens in Story 4's `record-stripper`, not here.
- This module is a pure function with no side effects — no filesystem access, no mocking needed.

### Spec Deviation

None. Checked against Tech Design: §Flow 3 — Turn Boundary sub-section, §Low Altitude — TurnInfo/TurnIdentificationResult interfaces, §Low Altitude — Turn Boundary Calculator entry point, §Module Responsibility Matrix (turn-boundary-calculator row), §Chunk 3 scope and TC mapping.

## Technical Checklist

- [ ] All TCs have passing tests (8 TCs)
- [ ] Non-TC decided tests pass (3 tests)
- [ ] TypeScript compiles clean (`bun run typecheck`)
- [ ] Lint/format passes (`bun run format:check && bun run lint`)
- [ ] No regressions on Stories 0-2 (`bun test`)
- [ ] Verification: `bun run verify`
- [ ] Spec deviations documented (if any)
