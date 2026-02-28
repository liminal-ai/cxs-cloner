# Epic: Codex Session Cloner (cxs-cloner)

## User Profile

**Primary persona**: Developer using OpenAI Codex CLI for coding tasks who encounters context window exhaustion during long sessions.

**Mental model**: The user understands that Codex sessions accumulate tool calls, shell execution records, and reasoning blocks that consume context window capacity. They want to create a "cleaned" copy of their session that preserves the conversational content while stripping the machinery, then resume from the cleaned version.

**Workflow context**: The user works in a terminal, runs `codex` sessions that can span hours, and periodically needs to reclaim context. They may have sessions that were previously compacted by Codex's native compaction and then filled up again with tool calls. They want a CLI tool they can run between sessions or when they notice degradation.

**Prior art familiarity**: Many users of this tool will also use ccs-cloner for Claude Code sessions. Interface consistency is valued.

## Feature Overview

After this feature ships, the user can:

1. **List** their Codex sessions with metadata (date, working directory, first message, size) to identify which session to clone
2. **Inspect** a specific session to see detailed statistics (turn count, tool call count, reasoning block count, file size, compaction status)
3. **Clone** a session with configurable stripping of tool calls and reasoning blocks, producing a new session file that is resumable via `codex resume` (when written to the default sessions directory)

What they cannot do today: There is no tool to selectively strip tool calls from Codex sessions. The native `codex fork` copies everything. The native compaction summarizes everything (losing conversational detail). There is no middle ground.

---

## User Flows

### UF-1: List Sessions

1. User runs `cxs-cloner list`
2. System scans `~/.codex/sessions/` directory hierarchy
3. System displays sessions sorted by recency (newest first), showing:
   - Session ID (truncated UUID)
   - Date/time
   - Working directory
   - First user message (truncated)
   - File size
4. User identifies the session they want to work with

### UF-2: Inspect Session

1. User runs `cxs-cloner info <sessionId>`
2. System finds and parses the full JSONL file
3. System displays:
   - Session metadata (model, CLI version, git branch, working directory)
   - Turn count
   - Record counts by type (messages, tool calls, reasoning blocks, event messages)
   - Compaction status (number of compacted records, their positions)
   - File size with estimated token count
4. User uses this information to decide stripping strategy

### UF-3: Clone with Tool Stripping

1. User runs `cxs-cloner clone <sessionId> --strip-tools`
2. System finds and parses the source session
3. System identifies turn boundaries from `turn_context` records
4. System applies zone-based stripping (remove oldest tool turns → truncate middle → preserve newest)
5. System strips reasoning blocks (default behavior, overridable via `--strip-reasoning`)
6. System strips telemetry event messages and non-essential `turn_context` content
7. System generates new thread ID and properly-named output file
8. System writes clone to `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<newId>.jsonl`
9. System displays statistics (original size, clone size, reduction %, items removed)
10. System displays resume command: `codex resume <newId>`

**Error paths:**
- No stripping flags provided (`clone <id>` with no `--strip-tools` or `--strip-reasoning`) → error: "At least one stripping flag is required. Use --strip-tools, --strip-reasoning, or both."
- Session not found → error with suggestions (partial match candidates)
- Session has zero tool calls → clone proceeds (reasoning/telemetry still stripped), warning emitted
- Malformed JSON lines in source → clone aborts with error listing bad lines (use `--force` to skip)
- Disk full on write → error, partial file cleaned up

### UF-4: Clone with Preset Selection

1. User runs `cxs-cloner clone <sessionId> --strip-tools=aggressive`
2. System resolves preset to specific parameters
3. Remainder follows UF-3 from step 2

### UF-5: Clone Compacted Session

1. User runs `cxs-cloner clone <sessionId> --strip-tools` on a session containing compacted records
2. System detects compaction records and notes their positions
3. System identifies tool-bearing turns only in the post-compaction portion
4. System applies zone-based stripping adjusted for the compacted context
5. Compacted records are preserved in output
6. Remainder follows UF-3 from step 7

### UF-6: Clone with Custom Output Path

1. User runs `cxs-cloner clone <sessionId> --strip-tools --output /path/to/export.jsonl`
2. System performs stripping per UF-3
3. System writes to custom path instead of Codex sessions directory
4. System warns: "Custom output path — clone will not appear in `codex resume`"
5. System does NOT display resume command

### UF-7: Strip Reasoning Only (No Tool Stripping)

1. User runs `cxs-cloner clone <sessionId> --strip-reasoning`
2. System clones session, removing only reasoning records
3. Telemetry event messages are NOT stripped (no `--strip-tools` active)
4. Output follows UF-3 from step 7

---

## Acceptance Criteria

### AC-1: Session Discovery

**AC-1.1**: The system SHALL scan `~/.codex/sessions/` recursively through the `YYYY/MM/DD/` hierarchy to discover session files.

- **TC-1.1.1**: Given a `~/.codex/sessions/2026/02/28/` directory containing two `.jsonl` files, when `list` is called, then both sessions are returned.
- **TC-1.1.2**: Given sessions across multiple date directories (`2026/01/15/`, `2026/02/28/`), when `list` is called, then sessions are returned sorted newest first.
- **TC-1.1.3**: Given an empty sessions directory, when `list` is called, then an empty result is returned with no error.

**AC-1.2**: The system SHALL extract session metadata from the filename and `session_meta` record.

- **TC-1.2.1**: Given a file named `rollout-2026-02-28T14-30-00-<uuid>.jsonl`, when metadata is extracted, then `created_at` matches `2026-02-28T14:30:00` and `thread_id` matches `<uuid>`.
- **TC-1.2.2**: Given a session file with a `session_meta` record containing `cwd`, `model_provider`, `cli_version`, and `git` fields, when metadata is extracted, then all fields are available.

**AC-1.3**: The system SHALL extract the first user message for display.

- **TC-1.3.1**: Given a session with a `response_item` of type `message` with `role: "user"`, when the first message is extracted, then the text content is returned truncated to 80 characters.
- **TC-1.3.2**: Given a session with an `event_msg` of subtype `user_message` but no user `response_item`, when the first message is extracted, then the `event_msg` message text is used as fallback.

**AC-1.4**: The system SHALL support a `--limit` flag to cap the number of sessions returned.

- **TC-1.4.1**: Given 50 sessions and `--limit 10`, when `list` is called, then exactly 10 sessions are returned (newest first).

**AC-1.5**: The system SHALL support a `--codex-dir` flag to override the default `~/.codex` directory.

- **TC-1.5.1**: Given `--codex-dir /tmp/test-codex`, when `list` is called, then sessions are scanned from `/tmp/test-codex/sessions/`.

### AC-2: Session Info

**AC-2.1**: The system SHALL parse a complete session JSONL file and report record-level statistics.

- **TC-2.1.1**: Given a session with 10 `response_item` records of type `function_call`, when `info` is called, then `function_calls: 10` is reported.
- **TC-2.1.2**: Given a session with 3 `response_item` records of type `reasoning`, when `info` is called, then `reasoning_blocks: 3` is reported.
- **TC-2.1.3**: Given a session with 50 `event_msg` records, when `info` is called, then `event_messages: 50` is reported.

**AC-2.2**: The system SHALL report compaction status.

- **TC-2.2.1**: Given a session with 2 `compacted` records, when `info` is called, then `compacted_records: 2` is reported with their line positions.
- **TC-2.2.2**: Given a session with 0 `compacted` records, when `info` is called, then `compacted: none` is reported.

**AC-2.3**: The system SHALL report turn count.

- **TC-2.3.1**: Given a session with 5 `turn_context` records, when `info` is called, then `turns: 5` is reported.

**AC-2.4**: The system SHALL report file size and estimated token count.

- **TC-2.4.1**: Given a session file of 100,000 bytes, when `info` is called, then file size is reported as `~98 KB` and estimated tokens as `~25,000` (using 4 bytes/token heuristic).

**AC-2.5**: The system SHALL find sessions by partial UUID match.

- **TC-2.5.1**: Given a session with UUID `019ba2c8-d0d3-7a12-9483-256375a8b26a` and input `019ba2c8`, when `info` is called, then the session is found.
- **TC-2.5.2**: Given a partial ID that matches multiple sessions, when `info` is called, then an error is returned listing the ambiguous matches.

### AC-3: JSONL Parsing

**AC-3.1**: The system SHALL parse all five record types (`session_meta`, `response_item`, `turn_context`, `event_msg`, `compacted`).

- **TC-3.1.1**: Given a line with `"type": "session_meta"`, when parsed, then `payload.id`, `payload.cwd`, and `payload.cli_version` are accessible.
- **TC-3.1.2**: Given a line with `"type": "response_item"` and `"payload": {"type": "function_call", ...}`, when parsed, then `payload.name`, `payload.arguments`, and `payload.call_id` are accessible.
- **TC-3.1.3**: Given a line with `"type": "response_item"` and `"payload": {"type": "reasoning", ...}`, when parsed, then `payload.summary` and `payload.encrypted_content` are accessible.
- **TC-3.1.4**: Given unknown record types or unknown `response_item` subtypes, when parsed, then the record is preserved as-is (passthrough) with a debug-level log.

**AC-3.2**: The system SHALL handle `response_item` polymorphism correctly.

- **TC-3.2.1**: Given response_items with subtypes `message`, `function_call`, `function_call_output`, `reasoning`, `local_shell_call`, `custom_tool_call`, `custom_tool_call_output`, `web_search_call`, `ghost_snapshot`, `compaction`, when parsed, then each subtype is correctly identified by `payload.type`.

**AC-3.3**: The system SHALL handle malformed JSON differently by command.

- **TC-3.3.1**: Given a malformed JSON line when running `list` or `info`, then the line is skipped with a warning and processing continues.
- **TC-3.3.2**: Given a malformed JSON line when running `clone`, then the operation aborts with an error identifying the malformed line number.
- **TC-3.3.3**: Given a malformed JSON line when running `clone --force`, then the line is skipped with a warning, and the output omits it.

### AC-4: Turn Boundary Identification

**AC-4.1**: The system SHALL identify turn boundaries from `turn_context` records.

- **TC-4.1.1**: Given a session with 3 `turn_context` records at lines 5, 20, and 40, when turns are identified, then 3 turns are found with boundaries [5-19], [20-39], [40-end].
- **TC-4.1.2**: Given a session with `event_msg` of subtype `user_message` appearing between `turn_context` records, when turns are identified, then turns are bounded by `turn_context` records (not event messages).

**AC-4.2**: The system SHALL handle pre-turn records.

- **TC-4.2.1**: Given a session where `session_meta` and initial `response_item` records appear before any `turn_context`, when turns are identified, then these pre-turn records are preserved unconditionally and are not assigned to any turn.

**AC-4.3**: The system SHALL handle sessions with compacted records.

- **TC-4.3.1**: Given a session with a `compacted` record at line 10 followed by 5 `turn_context` records, when turns are identified, then turns are identified only for the post-compaction portion.
- **TC-4.3.2**: Given a session where a `turn_context` appears, then compaction occurs, then another `turn_context` appears within the same logical turn, when turns are identified, then only the post-compaction `turn_context` records define turns (pre-compaction records are treated as pre-turn context).

**AC-4.4**: The system SHALL identify which turns contain tool calls.

- **TC-4.4.1**: Given a turn containing `response_item` records with subtypes `function_call` and `function_call_output`, when the turn is analyzed, then it is classified as tool-bearing.
- **TC-4.4.2**: Given a turn containing only `message` and `reasoning` subtypes, when the turn is analyzed, then it is NOT classified as tool-bearing.
- **TC-4.4.3**: Given a turn containing `local_shell_call`, `custom_tool_call`, or `web_search_call` subtypes, when the turn is analyzed, then it IS classified as tool-bearing.

### AC-5: Zone-Based Tool Stripping

**AC-5.1**: The system SHALL apply the "keep last N tool-bearing turns" model with three zones: removed, truncated, preserved.

**Terminology**: `keepTurnsWithTools` = number of tool-bearing turns to retain (not fully remove). Of retained turns, `truncatePercent` controls how many have their content truncated vs. preserved at full fidelity. Fractional results use `Math.floor` (e.g., 50% of 5 kept turns = 2 truncated, 3 full fidelity). Example: keep=20, truncate=50% means 20 turns are retained, of which 10 are truncated and 10 are full fidelity.

- **TC-5.1.1**: Given 30 tool-bearing turns and preset `default` (keep=20, truncate=50%), when stripping is applied, then: 10 turns fully stripped, 10 turns truncated, 10 turns preserved at full fidelity.
- **TC-5.1.2**: Given 5 tool-bearing turns and preset `default` (keep=20), when stripping is applied, then: 0 turns stripped (all 5 preserved since 5 < 20).

**AC-5.2**: The system SHALL remove tool call records and their paired outputs.

Tool call types have different pairing behaviors:

- `function_call` → paired with `function_call_output` by `call_id`
- `custom_tool_call` → paired with `custom_tool_call_output` by `call_id`
- `local_shell_call` → standalone record (output conveyed via `event_msg` records)
- `web_search_call` → standalone record (no paired output type)

- **TC-5.2.1**: Given a removed `function_call` with `call_id: "call_xyz"`, when stripping is applied, then the `function_call_output` with `call_id: "call_xyz"` is also removed.
- **TC-5.2.2**: Given a removed `custom_tool_call` with `call_id: "call_abc"`, when stripping is applied, then the `custom_tool_call_output` with `call_id: "call_abc"` is also removed.
- **TC-5.2.3**: Given a removed `local_shell_call`, when stripping is applied, then the record is removed (no output pairing needed).
- **TC-5.2.4**: Given a removed `web_search_call`, when stripping is applied, then the record is removed (no output pairing needed).

**AC-5.3**: In the truncated zone, the system SHALL truncate tool output content rather than removing it entirely.

- **TC-5.3.1**: Given a `function_call_output` with a 5000-character string `output` in the truncated zone, when stripping is applied, then the output is truncated to 120 characters with `"..."` suffix.
- **TC-5.3.2**: Given a `function_call_output` with a `ContentItem[]` array `output` in the truncated zone, when stripping is applied, then text items within the array are truncated.
- **TC-5.3.3**: Given a `function_call` with a large `arguments` JSON string in the truncated zone, when stripping is applied, then the `arguments` string is parsed as JSON, string values within are truncated, and the result is re-serialized.

**AC-5.4**: The system SHALL support the preset system with built-in presets.

- **TC-5.4.1**: Given `--strip-tools` (no value), when clone is run, then the `default` preset is applied (keep=20, truncate=50%).
- **TC-5.4.2**: Given `--strip-tools=extreme`, when clone is run, then all tool calls are removed (keep=0).
- **TC-5.4.3**: Given `--strip-tools=heavy`, when clone is run, then keep=10, truncate=80% is applied.

**AC-5.5**: When all tool records in a turn are removed, the system SHALL remove the entire turn if no conversational content remains.

- **TC-5.5.1**: Given a turn in the removed zone that contains only `function_call` and `function_call_output` records (no `message` records), when stripping is applied, then the entire turn is removed including its `turn_context` and associated `event_msg` records.
- **TC-5.5.2**: Given a turn in the removed zone that contains both `function_call` and `message` records, when stripping is applied, then tool records are removed but `message` records and the turn structure are preserved.

### AC-6: Reasoning Stripping

**AC-6.1**: The `--strip-reasoning` flag SHALL control reasoning removal independently.

When `--strip-reasoning` is explicitly provided, its value governs reasoning behavior regardless of whether `--strip-tools` is also active. When `--strip-reasoning` is NOT provided but `--strip-tools` IS provided, reasoning defaults to `full` removal. When neither flag is provided, no stripping occurs.

| `--strip-tools` | `--strip-reasoning` | Reasoning behavior |
|-----------------|--------------------|--------------------|
| absent | absent | Error: at least one flag required |
| absent | `full` | Strip reasoning only |
| absent | `summary-only` | Reduce reasoning to summaries only |
| present | absent (implicit) | Strip reasoning (default=`full`) |
| present | `full` | Strip reasoning |
| present | `summary-only` | Reduce reasoning to summaries |
| present | `none` | Preserve reasoning unchanged |

- **TC-6.1.0**: Given `clone <id>` with neither `--strip-tools` nor `--strip-reasoning`, when clone is run, then the command returns an error requiring at least one stripping flag.
- **TC-6.1.1**: Given `--strip-tools` without `--strip-reasoning`, when clone is run, then reasoning records are removed (implicit default=`full`).
- **TC-6.1.2**: Given `--strip-tools --strip-reasoning=none`, when clone is run, then tool records are stripped but reasoning records are preserved.
- **TC-6.1.3**: Given `--strip-reasoning=full` without `--strip-tools`, when clone is run, then reasoning records are removed but tool records and telemetry are preserved.
- **TC-6.1.4**: Given `--strip-reasoning=summary-only`, when clone is run, then reasoning records are retained but `encrypted_content` and `content` fields are removed, keeping only `summary`.

**AC-6.2**: The system SHALL handle both `reasoning` response_item subtypes and `compaction` response_item subtypes.

- **TC-6.2.1**: Given a `response_item` of subtype `reasoning`, when full reasoning stripping is active, then the entire record is removed.
- **TC-6.2.2**: Given a `response_item` of subtype `compaction` (inline encrypted compaction), when stripping is active, then the record is preserved (it is a compaction artifact, not reasoning).

### AC-7: Telemetry and Context Stripping

**AC-7.1**: When tool stripping is active, the system SHALL remove telemetry `event_msg` records.

The system uses a preserve-list approach. The following `event_msg` subtypes are preserved; all others are stripped:

**Preserve list**: `user_message`, `error`

All other `event_msg` subtypes (including but not limited to `exec_command_begin`, `exec_command_end`, `exec_command_output_delta`, `token_count`, `turn_started`, `turn_complete`, `agent_reasoning`, `agent_message`, `agent_message_delta`, `context_compacted`) are stripped when stripping is active.

- **TC-7.1.1**: Given `event_msg` records with subtypes `exec_command_begin`, `exec_command_end`, `exec_command_output_delta`, when stripping is active, then these records are removed.
- **TC-7.1.2**: Given `event_msg` records with subtype `user_message`, when stripping is active, then these records are preserved.
- **TC-7.1.3**: Given `event_msg` records with subtype `error`, when stripping is active, then these records are preserved.
- **TC-7.1.4**: Given `event_msg` records with subtypes not in the preserve list (`token_count`, `agent_reasoning`, etc.), when stripping is active, then these records are removed.

**AC-7.2**: When tool stripping is active, the system SHALL strip `turn_context` records aggressively.

`turn_context` records can be very large because they repeat full instruction content every turn. Real payloads contain:
- `user_instructions` — full AGENTS.md + skills list (can be 10KB+)
- `developer_instructions` — app-context directives (can be 5KB+)
- `collaboration_mode.settings.developer_instructions` — nested copy of mode-specific instructions

Stripping strategy by zone:
- **Removed zone**: Remove entire `turn_context` record
- **Truncated zone**: Remove entire `turn_context` record
- **Preserved zone**: Keep `turn_context` but strip high-volume fields: `user_instructions`, `developer_instructions`, `instructions`, and `collaboration_mode` (retain structural fields: `turn_id`, `cwd`, `model`, `effort`, `personality`, `approval_policy`, `sandbox_policy`, `truncation_policy`)

- **TC-7.2.1**: Given a turn in the removed zone, when stripping is applied, then the `turn_context` record for that turn is removed.
- **TC-7.2.2**: Given a turn in the truncated zone, when stripping is applied, then the `turn_context` record for that turn is removed.
- **TC-7.2.3**: Given a turn in the preserved zone with a `turn_context` containing `user_instructions`, `developer_instructions`, and `collaboration_mode` fields, when stripping is applied, then the `turn_context` is retained but those fields are removed.

**AC-7.3**: When tool stripping is active, the system SHALL remove `ghost_snapshot` records.

- **TC-7.3.1**: Given `response_item` records of subtype `ghost_snapshot`, when stripping is active, then these records are removed.

### AC-8: Clone Output

**AC-8.1**: The system SHALL generate a new thread ID for the cloned session.

- **TC-8.1.1**: When a clone is created, then the output file has a new UUID that differs from the source.
- **TC-8.1.2**: When a clone is created, then the `session_meta` record in the output contains the new thread ID.

**AC-8.2**: The system SHALL write the clone to the correct location with proper naming.

- **TC-8.2.1**: When a clone is created with no `--output` flag, then the output file is written to `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<newId>.jsonl` where the date matches the current date.
- **TC-8.2.2**: When `--output /custom/path.jsonl` is specified, then the clone is written to the custom path instead.

**AC-8.3**: The resume guarantee SHALL apply only when the clone is written to the default Codex sessions directory.

- **TC-8.3.1**: Given a clone written to the default sessions directory, when `codex resume <newId>` is run, then the session is discoverable. (Integration test — manual validation.)
- **TC-8.3.2**: Given a clone written to a custom `--output` path, then the system does NOT display a resume command and instead warns that the clone will not appear in `codex resume`.
- **TC-8.3.3**: Given a cloned session file, when parsed line-by-line, then every line is valid JSON.

**AC-8.4**: The system SHALL update `session_meta` in the clone.

- **TC-8.4.1**: When a clone is created, then the `session_meta` record has the new thread ID in `payload.id`.
- **TC-8.4.2**: When a clone is created, then the `session_meta` record preserves the original `cwd`, `git`, and `model_provider` fields.
- **TC-8.4.3**: When a clone is created, then the `session_meta` record sets `forked_from_id` to the source session's thread ID.

**AC-8.5**: The system SHALL report statistics after cloning.

- **TC-8.5.1**: When a clone completes, then the output includes: original size, clone size, size reduction %, records removed by type (tool calls, reasoning, event messages, turn_context, ghost_snapshots), turn counts.
- **TC-8.5.2**: When `--json` is specified, then statistics are output as a JSON object.

### AC-9: Configuration

**AC-9.1**: The system SHALL support layered configuration (defaults → config file → env vars → CLI flags).

- **TC-9.1.1**: Given `CXS_CLONER_CODEX_DIR=/custom/path` and no CLI flag, when the tool runs, then `/custom/path` is used as the Codex directory.
- **TC-9.1.2**: Given both `CXS_CLONER_CODEX_DIR=/env/path` and `--codex-dir /cli/path`, when the tool runs, then `/cli/path` is used (CLI flag wins).

**AC-9.2**: The system SHALL support custom presets and default preset in config files.

- **TC-9.2.1**: Given a `cxs-cloner.config.ts` with `customPresets: { "light": { keepTurnsWithTools: 30, truncatePercent: 30 } }`, when `--strip-tools=light` is used, then the custom preset values are applied.
- **TC-9.2.2**: Given a config file with `defaultPreset: "aggressive"`, when `--strip-tools` is used without a preset name, then the `aggressive` preset is applied instead of `default`.

**AC-9.3**: The system SHALL support an `event_msg` preserve-list override in configuration.

- **TC-9.3.1**: Given a config file with `eventPreserveList: ["user_message", "error", "agent_message"]`, when stripping is active, then `agent_message` events are preserved in addition to the built-in defaults.

### AC-10: Compacted Session Handling

**AC-10.1**: The system SHALL detect and preserve compacted records in the output.

Both top-level `compacted` records and `response_item` records of subtype `compaction` are preserved.

- **TC-10.1.1**: Given a session with a top-level `compacted` record, when clone is run with `--strip-tools`, then the `compacted` record is present in the output unchanged.
- **TC-10.1.2**: Given a session with a `response_item` of subtype `compaction`, when clone is run with `--strip-tools`, then the `compaction` response_item is present in the output unchanged.

**AC-10.2**: The system SHALL report compaction status in clone statistics.

- **TC-10.2.1**: Given a session with compacted records, when clone statistics are displayed, then a `compaction_detected: true` flag and count are included.

**AC-10.3**: The system SHALL apply stripping effectively to post-compaction tool-bearing turns.

- **TC-10.3.1**: Given a compacted session with 15 post-compaction tool-bearing turns and preset `default` (keep=20), when stripping is applied, then all 15 turns are preserved (since 15 < 20) but reasoning and telemetry are still stripped.
- **TC-10.3.2**: Given a compacted session with 40 post-compaction tool-bearing turns and preset `default`, when stripping is applied, then 20 turns are stripped, 10 truncated, 10 preserved.

> **Note**: Preset calibration for compacted sessions is a known tuning requirement. Initial presets match ccs-cloner values. Calibration against real compacted session samples is planned as a follow-up activity after initial build.

---

## Data Contracts

### Codex JSONL Record (input)

```typescript
interface RolloutLine {
  timestamp: string;  // ISO 8601
  type: "session_meta" | "response_item" | "turn_context" | "event_msg" | "compacted";
  payload: SessionMetaPayload | ResponseItemPayload | TurnContextPayload | EventMsgPayload | CompactedPayload;
}
```

### ResponseItem Payload (polymorphic)

```typescript
type ResponseItemPayload =
  | { type: "message"; role: string; content: ContentItem[]; end_turn?: boolean; phase?: "commentary" | "final_answer" }
  | { type: "reasoning"; summary: SummaryItem[]; content?: ReasoningContent[]; encrypted_content?: string }
  | { type: "function_call"; name: string; arguments: string; call_id: string }
  | { type: "function_call_output"; call_id: string; output: string | ContentItem[] }
  | { type: "local_shell_call"; call_id: string; action: ShellAction; status: string }
  | { type: "custom_tool_call"; call_id: string; name: string; input: string; status?: string }
  | { type: "custom_tool_call_output"; call_id: string; output: string | ContentItem[] }
  | { type: "web_search_call"; action?: SearchAction; status?: string }
  | { type: "ghost_snapshot"; ghost_commit: unknown }
  | { type: "compaction"; encrypted_content: string };
```

**Pairing rules:**
- `function_call` ↔ `function_call_output` — linked by `call_id`
- `custom_tool_call` ↔ `custom_tool_call_output` — linked by `call_id`
- `local_shell_call` — standalone (outputs via `event_msg` records)
- `web_search_call` — standalone (no paired output type)

**Note on `arguments`:** The `arguments` field on `function_call` is a JSON-encoded string (not a parsed object). Truncation in the truncated zone requires parsing, truncating string values, and re-serializing.

**Note on `output` union:** The `output` field on `function_call_output` and `custom_tool_call_output` is an untagged union — either a plain string or an array of `ContentItem`. Truncation logic must handle both forms.

### ContentItem

```typescript
type ContentItem =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "output_text"; text: string };
```

### SessionMeta Payload

```typescript
interface SessionMetaPayload {
  id: string;
  forked_from_id?: string;
  timestamp: string;
  cwd: string;
  originator: string;
  cli_version: string;
  source: string;
  agent_nickname?: string;
  agent_role?: string;
  model_provider?: string;
  base_instructions?: { text: string };
  git?: {
    commit_hash?: string;
    branch?: string;
    origin_url?: string;       // Canonical per Rust source
    repository_url?: string;   // Observed in older sessions — accept both
  };
}
```

### TurnContext Payload

```typescript
interface TurnContextPayload {
  turn_id?: string;
  cwd: string;
  model: string;
  effort?: string;
  approval_policy: unknown;
  sandbox_policy: unknown;
  truncation_policy?: { mode: string; limit: number };
  personality?: unknown;
  // High-volume fields (strip targets):
  user_instructions?: string;          // Full AGENTS.md + skills list (10KB+)
  instructions?: string;               // Alternative field name in some versions
  developer_instructions?: string;     // App-context directives (5KB+)
  collaboration_mode?: {               // Contains nested developer_instructions copy
    mode: string;
    settings: {
      model: string;
      reasoning_effort: string;
      developer_instructions: string;  // Another copy of instructions
    };
  };
}
```

### CompactedPayload

```typescript
interface CompactedPayload {
  message: string;
  replacement_history?: ResponseItemPayload[];  // May contain tool call items — not re-analyzed for stripping
}
```

### Clone Result (output)

```typescript
interface CloneResult {
  operationSucceeded: boolean;
  clonedThreadId: string;
  clonedSessionFilePath: string;
  sourceThreadId: string;
  sourceSessionFilePath: string;
  resumable: boolean;                // true when output is in Codex sessions directory
  statistics: CloneStatistics;
}

interface CloneStatistics {
  turnCountOriginal: number;
  turnCountOutput: number;
  functionCallsRemoved: number;
  functionCallsTruncated: number;
  reasoningBlocksRemoved: number;
  eventMessagesRemoved: number;
  turnContextRecordsRemoved: number;
  ghostSnapshotsRemoved: number;
  compactionDetected: boolean;
  compactedRecordCount: number;
  fileSizeReductionPercent: number;
  originalSizeBytes: number;
  outputSizeBytes: number;
}
```

---

## Scope Boundaries

### In Scope

- CLI tool with clone, list, info commands
- Zone-based tool stripping with preset system
- Reasoning stripping (full, summary-only, none modes) — operable independently or with tool stripping
- Telemetry event stripping with configurable preserve-list
- `turn_context` instruction stripping for context savings
- `ghost_snapshot` stripping
- Resumable output when written to default Codex sessions directory
- Session discovery via filesystem scan
- Partial UUID session lookup
- Configuration via file, env, and CLI flags
- Human and JSON output formats
- SDK exports for programmatic use
- Compacted record detection, preservation, and correct turn identification around compaction boundaries
- `forked_from_id` lineage tracking on cloned sessions

### Out of Scope

- SQLite database integration (read or write) — filesystem-only discovery
- LLM-based compression (no summarization, purely deterministic stripping)
- GUI or TUI interface
- Multi-session batch operations
- Session merging or splitting
- Undo/rollback of clone operations
- Integration with `codex fork` command
- Archived session handling (`archived_sessions/` directory)
- Codex plugin/skill integration
- Thread name lookup via `session_index.jsonl` for `info`/`clone` commands (UUID-only)
- Writing to `session_index.jsonl` (file-based discovery is sufficient)

### Assumptions

- Codex JSONL format is stable (based on protocol.rs definitions)
- `turn_context` records reliably mark turn boundaries in post-compaction portions of sessions
- File-based session discovery is sufficient (no SQLite needed)
- The 4 bytes/token heuristic is acceptable for rough size estimation (note: overestimates due to JSON structural overhead)
- Users have Bun or Node.js 18+ installed
- Unknown record types and unknown `response_item` subtypes should be preserved as-is (forward compatibility)
- Dangling conversational references (e.g., assistant says "let me read that file" but the `function_call` is stripped) are acceptable — the model handles these gracefully upon resume, consistent with ccs-cloner behavior

### Known Risks

- **Compacted session preset calibration**: Initial presets match ccs-cloner values. Real-world compacted sessions may require different values. Calibration planned as follow-up (Story 7).
- **`turn_context` boundary edge cases**: Mid-turn compaction can produce multiple `turn_context` records for a single logical turn. The algorithm handles this by treating only post-compaction `turn_context` records as boundaries, but untested edge cases may exist.
- **Event_msg subtype evolution**: Codex adds new event types across versions. The preserve-list approach (keep known-good, strip everything else) is forward-compatible but may over-strip in future versions. The configurable preserve-list mitigates this.

### Open Questions / Future Work

- **Preset calibration for compacted sessions**: Requires sample data to tune. Plan to collect compacted sessions and adjust.
- **ccs-cloner compaction fix**: Same underlying issue. Pending sample data from compacted Claude Code sessions.
- **Percentage-based stripping mode**: Alternative to absolute turn counts for better behavior on compacted sessions.

---

## Story Breakdown

### Story 0: Project Scaffold and Types
Foundation story. Set up project structure, TypeScript config, build pipeline, Biome config, and define all Codex JSONL types. No business logic.

**Depends on**: Nothing.

### Story 1: Session Discovery and List Command
Implement filesystem scanning of `~/.codex/sessions/` hierarchy. Extract metadata from filenames and `session_meta` records. Implement `cxs-cloner list` command with `--limit`, `--codex-dir`, `--json`, and `--verbose` flags.

**Depends on**: Story 0 (types, project structure).

### Story 2: Session Parser and Info Command
Implement full JSONL parsing with record type discrimination and polymorphic `response_item` handling. Calculate statistics (record counts by type, turn count, compaction status, file size). Implement `cxs-cloner info <sessionId>` command with partial ID matching.

**Depends on**: Story 0 (types), Story 1 (session discovery, partial ID lookup).

### Story 3: Turn Boundary Identification
Implement turn boundary detection from `turn_context` records. Handle pre-turn records, compaction boundaries, and mid-turn compaction edge cases. Identify tool-bearing turns (turns containing `function_call`, `local_shell_call`, `custom_tool_call`, or `web_search_call` records).

**Depends on**: Story 0 (types), Story 2 (JSONL parser).

### Story 4: Record Stripping Algorithm
Implement zone-based stripping: collect `call_id` values from removed tool calls, remove matching outputs (respecting pairing rules per tool type), truncate outputs in truncated zone (handling both string and ContentItem[] forms), strip reasoning records, strip telemetry events per preserve-list, strip `turn_context` instructions, strip `ghost_snapshot` records, handle empty turns after stripping. Implement preset system.

**Depends on**: Story 0 (types), Story 3 (turn boundaries).

### Story 5: Clone Pipeline and Output
Orchestrate the full clone pipeline: read → identify turns → strip → generate new thread ID → update session_meta (including `forked_from_id`) → write with proper filename to date hierarchy → report statistics. Implement `cxs-cloner clone` command with all flags. Handle custom output path (no resume guarantee). Handle `--force` for malformed input.

**Depends on**: Story 4 (stripping), Story 1 (session discovery).

### Story 6: Configuration and CLI Polish
Implement layered configuration (c12 + zod). Custom presets and default preset from config files. Event preserve-list override. Environment variable support. Help text. Error handling and user-facing messages. SDK exports via index.ts.

**Depends on**: Story 5 (clone pipeline — config wires into it).

### Story 7: Compacted Session Calibration (Follow-up)
Collect sample compacted sessions. Analyze tool-bearing turn distribution in compacted vs. fresh sessions. Tune preset values. Potentially add percentage-based stripping mode. This story may be deferred until sample data is available.

**Depends on**: Story 5 (working clone pipeline to test against).

---

## Reference Implementation

This tool is modeled on **ccs-cloner** (Claude Code Session Cloner), a production CLI that solves the same problem for Claude Code sessions. The architecture, CLI interface, preset system, zone-based stripping algorithm, and tech stack are deliberately parallel.

**Location**: `/Users/leemoore/code/agent-cli-tools/ccs-cloner/`

Key files worth reviewing during tech design:
- `src/core/tool-call-remover.ts` — zone-based stripping algorithm (the core logic this tool adapts)
- `src/core/turn-boundary-calculator.ts` — turn identification (simpler in cxs-cloner due to explicit `turn_context` records)
- `src/core/clone-operation-executor.ts` — full clone pipeline orchestration
- `src/config/tool-removal-presets.ts` — preset definitions and resolution
- `src/io/session-file-writer.ts` — atomic file writing patterns
- `src/types/session-line-item-types.ts` — Claude Code JSONL types (contrast with Codex types)
- `src/commands/clone-command.ts` — CLI command wiring with citty

The cxs-cloner is simpler in several ways (flat sequential format, no UUID tree repair, no parent chain, record-level stripping instead of content block surgery) but adds complexity in others (`turn_context` instruction stripping, tool call pairing across multiple record types, event_msg preserve-list). The tech overview documents the full mapping.

The Codex CLI source code is also available for format verification at `/Users/leemoore/code/agent-cli-tools/codex-reference/`. The canonical format definitions are in `codex-rs/protocol/src/protocol.rs` and `codex-rs/protocol/src/models.rs`.
