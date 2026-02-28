# Story Index: Codex Session Cloner

## Story Summary

| Story | Title | TCs | Dependency | What Ships |
|-------|-------|-----|------------|------------|
| 0 | Project Foundation | 0 | None | Types, errors, fixtures, config, build pipeline |
| 1 | Session Discovery and List Command | 10 | Story 0 | `cxs-cloner list` with --limit, --codex-dir, --json, --verbose |
| 2 | Session Parser and Info Command | 16 | Story 0, 1 | `cxs-cloner info <id>` with partial UUID, full parsing, statistics |
| 3 | Turn Boundary Identification | 8 | Story 0, 2 | Turn detection from turn_context, compaction handling, tool classification |
| 4 | Record Stripping Algorithm | 35 | Story 0, 3 | Zone-based stripping, tool pairing, truncation, reasoning/telemetry/context stripping, presets |
| 5 | Clone Pipeline and Output | 14 | Story 1, 2, 3, 4 | `cxs-cloner clone <id> --strip-tools` end-to-end, file writing, statistics, resume |
| 6 | Configuration and CLI Polish | 2 | Story 5 | Layered c12/zod config, env vars, SDK exports |
| 7 | Compacted Session Calibration | 0 | Story 5 | DEFERRED — blocked on sample data |

**Stories 0-6 carry 85 TCs total. Story 7 is deferred and excluded from story tech enrichment.**

---

## AC Split Policy

TC single-ownership is the rule — every TC is assigned to exactly one story. ACs may span stories when their TCs serve different functional contexts:

- **AC-3.3** splits parsing modes: TC-3.3.1 (non-strict skip-with-warning) goes to Story 1 where the list command uses it; TC-3.3.2 and TC-3.3.3 (strict/force modes) go to Story 2 where the parser gains these modes for clone's eventual use.
- **AC-6.1** splits CLI validation from algorithm behavior: TC-6.1.0 (no-flags error) goes to Story 5 where the clone command validates input; TC-6.1.1–6.1.4 (reasoning mode behavior) go to Story 4 where the record-stripper implements them.
- **AC-9** splits preset resolution from config loading: TC-9.2.1–9.2.2 and TC-9.3.1 (pure function resolution with custom presets/preserve-list) go to Story 4; TC-9.1.1–9.1.2 (layered config loading with env vars and CLI flags) go to Story 6.
- **AC-10** splits record preservation from statistics reporting: TC-10.1.1–10.1.2 and TC-10.3.1–10.3.2 (compacted record preservation and stripping behavior) go to Story 4; TC-10.2.1 (compaction status in clone statistics) goes to Story 5.

---

## Coverage Gate

Every AC and TC from the epic assigned to exactly one story. No gaps, no duplicates.

| AC | TC | Story | Notes |
|----|-----|-------|-------|
| AC-1.1 | TC-1.1.1 | Story 1 | |
| AC-1.1 | TC-1.1.2 | Story 1 | |
| AC-1.1 | TC-1.1.3 | Story 1 | |
| AC-1.2 | TC-1.2.1 | Story 1 | |
| AC-1.2 | TC-1.2.2 | Story 1 | |
| AC-1.3 | TC-1.3.1 | Story 1 | |
| AC-1.3 | TC-1.3.2 | Story 1 | |
| AC-1.4 | TC-1.4.1 | Story 1 | |
| AC-1.5 | TC-1.5.1 | Story 1 | |
| AC-2.1 | TC-2.1.1 | Story 2 | |
| AC-2.1 | TC-2.1.2 | Story 2 | |
| AC-2.1 | TC-2.1.3 | Story 2 | |
| AC-2.2 | TC-2.2.1 | Story 2 | |
| AC-2.2 | TC-2.2.2 | Story 2 | |
| AC-2.3 | TC-2.3.1 | Story 2 | |
| AC-2.4 | TC-2.4.1 | Story 2 | |
| AC-2.5 | TC-2.5.1 | Story 2 | |
| AC-2.5 | TC-2.5.2 | Story 2 | |
| AC-3.1 | TC-3.1.1 | Story 2 | |
| AC-3.1 | TC-3.1.2 | Story 2 | |
| AC-3.1 | TC-3.1.3 | Story 2 | |
| AC-3.1 | TC-3.1.4 | Story 2 | |
| AC-3.2 | TC-3.2.1 | Story 2 | |
| AC-3.3 | TC-3.3.1 | Story 1 | Non-strict mode for list/info |
| AC-3.3 | TC-3.3.2 | Story 2 | Strict mode (clone context) |
| AC-3.3 | TC-3.3.3 | Story 2 | Force mode (clone context) |
| AC-4.1 | TC-4.1.1 | Story 3 | |
| AC-4.1 | TC-4.1.2 | Story 3 | |
| AC-4.2 | TC-4.2.1 | Story 3 | |
| AC-4.3 | TC-4.3.1 | Story 3 | |
| AC-4.3 | TC-4.3.2 | Story 3 | |
| AC-4.4 | TC-4.4.1 | Story 3 | |
| AC-4.4 | TC-4.4.2 | Story 3 | |
| AC-4.4 | TC-4.4.3 | Story 3 | |
| AC-5.1 | TC-5.1.1 | Story 4 | |
| AC-5.1 | TC-5.1.2 | Story 4 | |
| AC-5.2 | TC-5.2.1 | Story 4 | |
| AC-5.2 | TC-5.2.2 | Story 4 | |
| AC-5.2 | TC-5.2.3 | Story 4 | |
| AC-5.2 | TC-5.2.4 | Story 4 | |
| AC-5.3 | TC-5.3.1 | Story 4 | |
| AC-5.3 | TC-5.3.2 | Story 4 | |
| AC-5.3 | TC-5.3.3 | Story 4 | |
| AC-5.4 | TC-5.4.1 | Story 4 | |
| AC-5.4 | TC-5.4.2 | Story 4 | |
| AC-5.4 | TC-5.4.3 | Story 4 | |
| AC-5.5 | TC-5.5.1 | Story 4 | |
| AC-5.5 | TC-5.5.2 | Story 4 | |
| AC-6.1 | TC-6.1.0 | Story 5 | CLI flag validation |
| AC-6.1 | TC-6.1.1 | Story 4 | Algorithm behavior |
| AC-6.1 | TC-6.1.2 | Story 4 | Algorithm behavior |
| AC-6.1 | TC-6.1.3 | Story 4 | Algorithm behavior |
| AC-6.1 | TC-6.1.4 | Story 4 | Algorithm behavior |
| AC-6.2 | TC-6.2.1 | Story 4 | |
| AC-6.2 | TC-6.2.2 | Story 4 | |
| AC-7.1 | TC-7.1.1 | Story 4 | |
| AC-7.1 | TC-7.1.2 | Story 4 | |
| AC-7.1 | TC-7.1.3 | Story 4 | |
| AC-7.1 | TC-7.1.4 | Story 4 | |
| AC-7.2 | TC-7.2.1 | Story 4 | |
| AC-7.2 | TC-7.2.2 | Story 4 | |
| AC-7.2 | TC-7.2.3 | Story 4 | |
| AC-7.3 | TC-7.3.1 | Story 4 | |
| AC-8.1 | TC-8.1.1 | Story 5 | |
| AC-8.1 | TC-8.1.2 | Story 5 | |
| AC-8.2 | TC-8.2.1 | Story 5 | |
| AC-8.2 | TC-8.2.2 | Story 5 | |
| AC-8.3 | TC-8.3.1 | Story 5 | Manual validation |
| AC-8.3 | TC-8.3.2 | Story 5 | |
| AC-8.3 | TC-8.3.3 | Story 5 | |
| AC-8.4 | TC-8.4.1 | Story 5 | |
| AC-8.4 | TC-8.4.2 | Story 5 | |
| AC-8.4 | TC-8.4.3 | Story 5 | |
| AC-8.5 | TC-8.5.1 | Story 5 | |
| AC-8.5 | TC-8.5.2 | Story 5 | |
| AC-9.1 | TC-9.1.1 | Story 6 | |
| AC-9.1 | TC-9.1.2 | Story 6 | |
| AC-9.2 | TC-9.2.1 | Story 4 | Preset resolver function |
| AC-9.2 | TC-9.2.2 | Story 4 | Preset resolver function |
| AC-9.3 | TC-9.3.1 | Story 4 | Stripper accepts custom list |
| AC-10.1 | TC-10.1.1 | Story 4 | |
| AC-10.1 | TC-10.1.2 | Story 4 | |
| AC-10.2 | TC-10.2.1 | Story 5 | |
| AC-10.3 | TC-10.3.1 | Story 4 | |
| AC-10.3 | TC-10.3.2 | Story 4 | |

---

## Integration Path Trace

### Path 1: List Sessions (UF-1)

| Segment | Description | Story | TC |
|---------|-------------|-------|----|
| User → list CLI | Run list with flags | Story 1 | TC-1.4.1, TC-1.5.1 |
| CLI → scanner | Scan sessions directory hierarchy | Story 1 | TC-1.1.1 |
| Scanner → reader | Extract metadata from session_meta | Story 1 | TC-1.2.2 |
| Reader → first message | Extract first user message | Story 1 | TC-1.3.1 |
| Output → user | Display formatted session list | Story 1 | TC-1.4.1 |

### Path 2: Inspect Session (UF-2)

| Segment | Description | Story | TC |
|---------|-------------|-------|----|
| User → info CLI | Run info with partial ID | Story 2 | TC-2.5.1 |
| CLI → scanner | Find session by partial UUID | Story 2 | TC-2.5.1 |
| Scanner → reader | Full session parse | Story 2 | TC-3.1.1 |
| Reader → statistics | Compute record counts, turns, compaction | Story 2 | TC-2.1.1 |
| Output → user | Display session statistics | Story 2 | TC-2.4.1 |

### Path 3: Clone Session (UF-3 — the critical path)

| Segment | Description | Story | TC |
|---------|-------------|-------|----|
| User → clone CLI | Parse flags, validate at least one strip flag | Story 5 | TC-6.1.0 |
| CLI → config | Load configuration (hardcoded in Story 5, layered in Story 6) | Story 5 / Story 6 | TC-9.1.1 |
| CLI → scanner | Find source session by partial ID | Story 2 | TC-2.5.1 |
| Scanner → reader | Full session parse (strict mode) | Story 2 | TC-3.1.1, TC-3.3.2 |
| Reader → turn-boundary-calc | Identify turns from turn_context records | Story 3 | TC-4.1.1 |
| Turn-calc → compaction handling | Adjust boundaries for compacted records | Story 3 | TC-4.3.1 |
| Turn-calc → tool classification | Classify tool-bearing turns | Story 3 | TC-4.4.1 |
| Turns → record-stripper | Zone computation (removed/truncated/preserved) | Story 4 | TC-5.1.1 |
| Stripper → tool pairing | Remove tool calls with paired outputs | Story 4 | TC-5.2.1 |
| Stripper → truncation | Truncate outputs in truncated zone | Story 4 | TC-5.3.1 |
| Stripper → reasoning | Strip reasoning records per mode | Story 4 | TC-6.1.1 |
| Stripper → telemetry | Strip event_msg per preserve-list | Story 4 | TC-7.1.1 |
| Stripper → turn_context | Strip instruction fields per zone | Story 4 | TC-7.2.1 |
| Stripper → ghost_snapshot | Remove ghost_snapshot records | Story 4 | TC-7.3.1 |
| Stripper → empty turns | Remove turns with no remaining content | Story 4 | TC-5.5.1 |
| Executor → new ID | Generate new UUID | Story 5 | TC-8.1.1 |
| Executor → session_meta | Update identity, set forked_from_id | Story 5 | TC-8.4.1 |
| Executor → writer | Write JSONL to date hierarchy | Story 5 | TC-8.2.1 |
| Writer → statistics | Compute size reduction, per-type counts | Story 5 | TC-8.5.1 |
| Output → resume | Display resume command (default path only) | Story 5 | TC-8.3.1 |

### Path 4: Clone with Custom Output (UF-6)

| Segment | Description | Story | TC |
|---------|-------------|-------|----|
| User → clone CLI | --output /custom/path.jsonl | Story 5 | TC-8.2.2 |
| Executor → writer | Write to custom path | Story 5 | TC-8.2.2 |
| Output → warning | No resume command, warn about custom path | Story 5 | TC-8.3.2 |

### Path 5: Strip Reasoning Only (UF-7)

| Segment | Description | Story | TC |
|---------|-------------|-------|----|
| User → clone CLI | --strip-reasoning=full (no --strip-tools) | Story 5 | — |
| Stripper → reasoning | Remove reasoning records | Story 4 | TC-6.1.3 |
| Stripper → telemetry | Telemetry NOT stripped (no --strip-tools) | Story 4 | TC-6.1.3 |

**No gaps detected.** Every segment of every user flow has a story owner and at least one relevant TC.

---

## Validation Checklist

- [x] Every AC from the epic assigned to at least one story
- [x] Every TC from the epic assigned to exactly one story (85/85)
- [x] Stories sequence logically (read before write, foundation before features)
- [x] Each story has full Given/When/Then detail for all TCs
- [x] Integration path trace complete with no gaps (5 paths traced)
- [x] Coverage gate table complete (85 rows, no orphans)
- [x] Error paths documented per story
- [x] Story 0 covers types, fixtures, error classes, project config
- [x] AC split policy documented with rationale for each split AC
- [x] Story 7 marked as deferred, excluded from tech enrichment
