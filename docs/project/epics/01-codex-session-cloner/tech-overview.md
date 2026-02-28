# Technical Overview: Codex Session Cloner (cxs-cloner)

## Purpose

CLI tool that clones OpenAI Codex CLI sessions with selective removal of tool calls and reasoning blocks to reclaim context window space. Modeled on the proven ccs-cloner (Claude Code Session Cloner) architecture, adapted for the Codex JSONL format.

## Codex JSONL Session Format

### Source of Truth

Format defined in the Codex CLI Rust codebase:
- Record definitions: `codex-rs/protocol/src/protocol.rs` (lines 2038–2174)
- ResponseItem subtypes: `codex-rs/protocol/src/models.rs` (lines 194–300)
- Serialization: `codex-rs/core/src/rollout/recorder.rs` (lines 916–936)
- Deserialization: `codex-rs/core/src/rollout/recorder.rs` (lines 528–591)

### Record Envelope

Every line in a session `.jsonl` file follows this structure:

```json
{
  "timestamp": "ISO-8601",
  "type": "record_type",
  "payload": { /* type-specific */ }
}
```

The `type` and `payload` fields are serde-flattened from a `RolloutItem` enum using `#[serde(tag = "type", content = "payload", rename_all = "snake_case")]`.

### Record Types

| Type | Purpose | Strippable? |
|------|---------|-------------|
| `session_meta` | Session initialization metadata | No — required for resume |
| `response_item` | Conversation content (polymorphic — see subtypes below) | Depends on subtype |
| `turn_context` | Execution context per turn (model, sandbox, approval policy) | Yes — telemetry |
| `event_msg` | UI/logging stream events (50+ subtypes) | Yes — most are telemetry |
| `compacted` | History summarization records | Preserve by default |

### ResponseItem Subtypes (the core content)

| Subtype | Role | Strippable? |
|---------|------|-------------|
| `message` | User/assistant/system/developer messages | No — core conversation |
| `reasoning` | Extended thinking (encrypted + summary) | Yes |
| `function_call` | Tool invocation (name, arguments, call_id) | Yes |
| `function_call_output` | Tool result (call_id, output) | Yes — paired with function_call |
| `local_shell_call` | Shell command execution | Yes |
| `custom_tool_call` | MCP/custom tool invocation | Yes |
| `custom_tool_call_output` | MCP/custom tool result | Yes — paired with custom_tool_call |
| `web_search_call` | Web search invocation | Yes |
| `ghost_snapshot` | Internal git diff snapshots | Yes — metadata |
| `compaction` | Inline compaction summary (encrypted) | Preserve |

### Tool Call Pairing

Tool calls and outputs are linked by `call_id`:
- `function_call.call_id` → `function_call_output.call_id`
- `custom_tool_call.call_id` → `custom_tool_call_output.call_id`

When stripping a tool call, the matching output must also be stripped.

### Reasoning Records

```json
{
  "type": "reasoning",
  "summary": [{"type": "summary_text", "text": "Considering options..."}],
  "content": [{"type": "text", "text": "..."}],       // plaintext (when available)
  "encrypted_content": "gAAAAB..."                      // encrypted (typical)
}
```

Only one of `content` or `encrypted_content` is serialized. For stripping:
- **Full strip**: Remove entire `reasoning` record
- **Summary-only**: Keep `summary`, drop `content`/`encrypted_content`

### EventMsg Subtypes (stripping strategy)

Most `event_msg` records are UI/telemetry. The stripping strategy uses a **preserve-list** — named subtypes are kept, everything else is stripped. This is forward-compatible: new event types added by future Codex versions are stripped by default rather than accidentally preserved.

**Default preserve-list**: `user_message`, `error`

**Stripped** (includes but not limited to): `exec_command_begin`, `exec_command_end`, `exec_command_output_delta`, `turn_started`, `turn_complete`, `token_count`, `agent_reasoning`, `agent_message`, `agent_message_delta`, `context_compacted`

The preserve-list is configurable via `cxs-cloner.config.ts` to accommodate future Codex versions or user preferences.

### TurnContext Records (context savings opportunity)

`turn_context` records can be very large because they repeat full instruction content every turn. Real payloads contain:
- `user_instructions` — full AGENTS.md + skills list (10KB+ observed)
- `developer_instructions` — app-context directives (5KB+ observed)
- `collaboration_mode` — contains nested `settings.developer_instructions` (another copy)

A typical turn_context payload can be 15-20KB. Across 30 turns, that's 450-600KB of duplicated instructions.

Stripping strategy:
- **Removed/truncated zones**: Remove entire `turn_context` record
- **Preserved zone**: Keep structural fields (`turn_id`, `cwd`, `model`, `effort`, `personality`, `approval_policy`, `sandbox_policy`, `truncation_policy`), strip `user_instructions`, `instructions`, `developer_instructions`, and `collaboration_mode`

## Session Storage Layout

### Directory Structure

```
~/.codex/
├── sessions/
│   └── YYYY/MM/DD/
│       └── rollout-YYYY-MM-DDThh-mm-ss-<uuid>.jsonl
├── archived_sessions/
│   └── YYYY/MM/DD/
│       └── rollout-YYYY-MM-DDThh-mm-ss-<uuid>.jsonl
├── session_index.jsonl          # Thread name → ID mapping (append-only)
├── config.toml                  # CLI configuration
└── state.sqlite                 # Optional SQLite index (feature-gated)
```

### Filename Convention

```
rollout-YYYY-MM-DDThh-mm-ss-<UUID>.jsonl
```

- Timestamp: ISO 8601 with second precision, hyphens replacing colons
- UUID: Thread ID (UUID v7 / ULID-like)

### Session Discovery

**Primary**: Filesystem scan of `~/.codex/sessions/` in reverse chronological order. Filename parsing extracts timestamp (created_at) and UUID (thread_id). File mtime provides updated_at.

**Codex also supports** (not used by cxs-cloner): SQLite `threads` table for indexed queries (feature-gated behind `sqlite` flag), and `session_index.jsonl` for thread name → ID mapping. The cloner uses filesystem-only discovery for simplicity.

## Resume Capability

Codex supports session resumption via `codex resume`:

```bash
codex resume              # Interactive picker
codex resume --last       # Most recent session
codex resume <uuid>       # By thread ID
codex resume <name>       # By thread name (from session_index.jsonl)
```

### Minimum requirements for a resumable session file:

1. Properly named file in date-based hierarchy
2. First record: `session_meta` with thread ID
3. At least one `response_item` with user role content (the resume code reconstructs `initial_messages` from `response_item` records, not `event_msg` records)
4. Valid JSONL (one JSON object per line)

No SQLite registration required. No additional metadata files required.

**Important**: Resume discoverability requires the file to be in `~/.codex/sessions/YYYY/MM/DD/`. Files written to custom paths via `--output` will not be discoverable by `codex resume`.

### Fork Capability

`codex fork <session_id>` creates a new independent session from an existing one. Same discovery mechanism. The cloner output is functionally equivalent to a fork with content removed.

## Mapping: ccs-cloner → cxs-cloner

### Concepts That Map Directly

| ccs-cloner Concept | cxs-cloner Equivalent |
|--------------------|-----------------------|
| Session discovery (project folder scan) | Session discovery (date-based directory scan) |
| Turn boundary identification | Turn boundary identification |
| Zone model (remove/truncate/preserve) | Zone model (same algorithm) |
| Preset system (default/aggressive/heavy/extreme) | Preset system (same, may need recalibration) |
| Tool stripping (content block surgery) | Tool stripping (record-level removal) |
| Thinking block removal | Reasoning record removal |
| Clone output with new session ID | Clone output with new thread ID and filename |
| Session index update | Not needed — filesystem discovery is sufficient |

### What's Simpler in Codex

| Area | Why |
|------|-----|
| **Turn boundaries** | Explicit `turn_context` records mark turn starts. No inference needed. |
| **Tool removal** | Tool calls are separate JSONL records. Drop entire lines instead of surgically modifying content block arrays. |
| **Reasoning removal** | Separate JSONL records. Drop entire lines. |
| **Conversation threading** | Flat sequential (line order = conversation order). No UUID tree, no `parentUuid` chain, no orphan detection, no parent chain repair. |
| **Session registration** | File-based discovery from filename. No mandatory index update. |

### What's Different

| Area | Detail |
|------|--------|
| **No sessions-index.json** | No index to update. Primary discovery is filesystem. |
| **No todos/session-env** | No equivalent metadata files to create alongside clone. |
| **Polymorphic response_item** | Single record type with 10+ subtypes. Need to match on `payload.type`. |
| **call_id pairing varies by tool type** | `function_call`/`custom_tool_call` pair with outputs via `call_id`. `local_shell_call`/`web_search_call` are standalone (no paired output type). |
| **Encrypted reasoning** | Content is encrypted. Can only keep/drop records, can't read/modify content. Summary field is accessible. |
| **`turn_context` bloat** | Records repeat full AGENTS.md per turn. Stripping `instructions` field is a significant context savings not present in ccs-cloner. |
| **`arguments` is JSON-in-JSON** | `function_call.arguments` is a JSON string, not a parsed object. Truncation requires parse → truncate → re-serialize. |
| **`output` is untagged union** | `function_call_output.output` can be a string OR a `ContentItem[]` array. Truncation must handle both. |

### What Doesn't Apply

| ccs-cloner Feature | Why Not Needed |
|--------------------|----------------|
| UUID/parentUuid tree handling | Codex is flat sequential |
| Parent chain repair | No parent chain |
| Active branch extraction | No branching model |
| sessions-index.json update | Not applicable |
| todos file creation | Not applicable |
| session-env directory creation | Not applicable |
| Summary entry injection | session_meta already provides identification |

## Compacted Session Stripping Problem

### The Issue

ccs-cloner's zone model ("keep last N tool-bearing turns") underperforms on sessions that have been compacted. When compaction condenses early history, the remaining visible turns are mostly tool-bearing. With only 20-25 tool-bearing turns visible, "keep 20" barely strips anything. Users report needing to jump straight to "extreme" mode.

### Why It Matters for Codex

Codex has native compaction (`compacted` records with `replacement_history`). Sessions can be compacted, accumulate more tool calls, then need stripping. The cloner must work well in this scenario.

### Design Approach

1. **Detect compaction**: Check for `compacted` records in the session. If present, note the position — it represents a context boundary.
2. **Adjust zone calculation**: When compaction is detected, the preset values may need to account for the reduced total turn count. Consider:
   - Percentage-based stripping (strip X% of tool-bearing turns) instead of absolute counts
   - Compaction-aware presets that apply more aggressive defaults
   - A `--compaction-aware` flag or auto-detection
3. **Preserve compacted records**: They represent already-optimized context. Strip tools around them, not the compaction itself.
4. **Calibration required**: Need sample compacted sessions (both Codex and Claude Code) to tune preset values. This is a known gap — initial presets will be best-effort, with explicit tuning planned.

## Tech Stack

Identical to ccs-cloner for consistency:

| Component | Library | Purpose |
|-----------|---------|---------|
| CLI framework | citty v0.2.x | Command parsing with subcommands |
| Configuration | c12 v3.x | Config file loading (cxs-cloner.config.ts, .cxs-clonerrc, etc.) |
| Validation | zod v3.24.x | Schema validation for config and session data |
| Logging | consola v3.4.x | Structured logging |
| Paths | pathe v2.x | Cross-platform path utilities |
| Build | Bun | Bundle TypeScript → Node.js-compatible output |
| Lint/Format | Biome | Code quality |
| Types | TypeScript 5.x | Type safety |

## CLI Interface

```
cxs-cloner clone <sessionId> [options]
cxs-cloner list [options]
cxs-cloner info <sessionId> [options]
```

### Clone Options
- `--strip-tools[=preset]` — Remove tools using preset (default, aggressive, heavy, extreme, or custom)
- `--strip-reasoning[=mode]` — Reasoning removal mode: full (default), summary-only, none
- `--output, -o <path>` — Custom output path (clone will not be resumable via `codex resume`)
- `--force` — Proceed despite malformed JSON lines (skip them with warnings)
- `--codex-dir <path>` — Override Codex data directory (~/.codex)
- `--json` — JSON output
- `--verbose, -v` — Verbose output

At least one of `--strip-tools` or `--strip-reasoning` is required.

### List Options
- `--limit, -n <count>` — Max sessions (default: 20)
- `--codex-dir <path>` — Override Codex data directory
- `--json` — JSON output
- `--verbose, -v` — Verbose details

### Info Options
- `--codex-dir <path>` — Override Codex data directory
- `--json` — JSON output
- `--verbose, -v` — Verbose details

## Source Directory Layout

```
src/
├── cli.ts                              # CLI entry point
├── index.ts                            # SDK exports
├── cli/
│   └── normalize-args.ts               # Arg preprocessing
├── commands/
│   ├── main-command.ts                 # Root command with subcommands
│   ├── clone-command.ts                # Clone session
│   ├── list-command.ts                 # List sessions
│   └── info-command.ts                 # Session details
├── config/
│   ├── configuration-loader.ts         # Merge config sources
│   ├── configuration-schema.ts         # Zod schemas
│   ├── default-configuration.ts        # Defaults and env vars
│   └── tool-removal-presets.ts         # Preset definitions and resolution
├── core/
│   ├── clone-operation-executor.ts     # Orchestrates clone pipeline
│   ├── record-stripper.ts             # Tool/reasoning record removal
│   └── turn-boundary-calculator.ts     # Turn identification from turn_context records
├── errors/
│   └── clone-operation-errors.ts       # Custom error classes
├── io/
│   ├── session-directory-scanner.ts    # Find sessions in ~/.codex/sessions
│   ├── session-file-reader.ts          # JSONL parsing
│   └── session-file-writer.ts          # Write JSONL with proper naming
├── output/
│   ├── clone-result-formatter.ts       # Human/JSON output
│   └── configured-logger.ts            # Logging setup
└── types/
    ├── index.ts                        # Type exports
    ├── codex-session-types.ts          # JSONL record schemas
    ├── clone-operation-types.ts        # Clone operation types
    ├── tool-removal-types.ts           # Preset and removal types
    └── configuration-types.ts          # Config types
```

### Key Simplifications vs. ccs-cloner

- **No `parent-chain-repairer.ts`** — flat sequential format, no UUID tree
- **No `active-branch-extractor.ts`** — no branching model
- **No `session-line-item-filter.ts`** — filtering logic folded into record-stripper (drop by record type)
- **`record-stripper.ts` replaces `tool-call-remover.ts`** — operates on whole records rather than content block arrays
- **`turn-boundary-calculator.ts` is simpler** — reads explicit `turn_context` records instead of inferring from content
