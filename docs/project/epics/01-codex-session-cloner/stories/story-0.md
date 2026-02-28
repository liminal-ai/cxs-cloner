# Story 0: Project Foundation

## Objective

Establish the shared infrastructure that all subsequent stories build on: type definitions, error classes, test fixtures, project configuration, and build pipeline. After this story, the project compiles clean and the test harness is ready.

## Scope

### In Scope

- All TypeScript type definitions from the tech design (Codex session types, clone operation types, tool removal types, configuration types)
- Error class hierarchy (`NotImplementedError`, `CxsError`, and feature-specific subclasses)
- `TURN_CONTEXT_STRUCTURAL_FIELDS` and `DEFAULT_EVENT_PRESERVE_LIST` constants
- `BUILT_IN_PRESETS` and `DEFAULT_TRUNCATE_LENGTH` constants
- Preset resolution function stubs
- `SessionBuilder` test fixture class for programmatic session construction
- Static test fixture files (basic session, compacted session, malformed session)
- Project configuration: `package.json` (dependencies, scripts including verification scripts), `tsconfig.json`, `biome.json`
- Type barrel exports (`src/types/index.ts`)

### Out of Scope

- Business logic implementation (Story 1+)
- CLI commands (Story 1+)
- TDD cycle (this is foundation-only)

## Dependencies / Prerequisites

- None. This is the first story.

## Exit Criteria

- [ ] All type definitions from tech design created and exported
- [ ] Error classes implemented with structured context properties
- [ ] `SessionBuilder` produces valid `RolloutLine[]` arrays supporting all tool types (function_call, local_shell_call, custom_tool_call, web_search_call)
- [ ] Static fixture files created (basic-session.jsonl, compacted-session.jsonl, malformed-session.jsonl)
- [ ] `bun run typecheck` passes clean
- [ ] `bun run format:check` passes clean
- [ ] `bun run lint` passes clean
- [ ] All verification scripts defined in package.json (`format`, `format:check`, `lint`, `check`, `typecheck`, `test`, `red-verify`, `verify`, `green-verify`, `guard:no-test-changes`, `verify-all`, `build`)
- [ ] Biome configured for formatting and linting
- [ ] TypeScript configured with strict mode and ESNext target

---

## Technical Implementation

### Architecture Context

Foundation setup for cxs-cloner. Creates type definitions, error classes, test fixtures, constants, and project configuration that all subsequent stories (1–6) depend on. No business logic, no TDD cycle — pure infrastructure.

**Source Layout (from Tech Design §Module Architecture):**

```
src/
├── cli.ts                              # Shebang entrypoint (stub)
├── index.ts                            # SDK barrel exports (stub)
├── config/
│   └── tool-removal-presets.ts         # Preset definitions + resolution stubs
├── errors/
│   └── clone-operation-errors.ts       # Custom error classes
└── types/
    ├── index.ts                        # Type barrel exports
    ├── codex-session-types.ts          # JSONL record type definitions
    ├── clone-operation-types.ts        # Clone pipeline types
    ├── tool-removal-types.ts           # Preset and stripping types
    └── configuration-types.ts          # Config schema types

test/
├── fixtures/
│   ├── builders/
│   │   └── session-builder.ts          # Programmatic session construction
│   ├── data/
│   │   ├── basic-session.jsonl         # Minimal valid session
│   │   ├── compacted-session.jsonl     # Session with compaction records
│   │   └── malformed-session.jsonl     # Lines with bad JSON
│   └── index.ts                        # Fixture exports + helpers
```

### Types to Create

All types from Tech Design §Low Altitude: Interface Definitions, organized by file:

**`src/types/codex-session-types.ts`** — the foundational vocabulary:

```typescript
// Universal JSONL record envelope
export interface RolloutLine {
  timestamp: string; // ISO 8601 with milliseconds
  type: RolloutType;
  payload: RolloutPayload;
}

export type RolloutType =
  | "session_meta"
  | "response_item"
  | "turn_context"
  | "event_msg"
  | "compacted";

export type RolloutPayload =
  | SessionMetaPayload
  | ResponseItemPayload
  | TurnContextPayload
  | EventMsgPayload
  | CompactedPayload;

// SessionMeta — first record in every session file
export interface SessionMetaPayload {
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
  git?: GitInfo;
  [key: string]: unknown; // Forward-compat
}

export interface GitInfo {
  commit_hash?: string;
  branch?: string;
  origin_url?: string;
  repository_url?: string; // Legacy field, accept both
}

// ResponseItem (polymorphic, 10+ subtypes)
export type ResponseItemPayload =
  | MessagePayload
  | ReasoningPayload
  | FunctionCallPayload
  | FunctionCallOutputPayload
  | LocalShellCallPayload
  | CustomToolCallPayload
  | CustomToolCallOutputPayload
  | WebSearchCallPayload
  | GhostSnapshotPayload
  | CompactionItemPayload
  | UnknownResponseItemPayload;

export interface MessagePayload {
  type: "message";
  role: string;
  content: ContentItem[];
  end_turn?: boolean;
  phase?: "commentary" | "final_answer";
}

export interface ReasoningPayload {
  type: "reasoning";
  summary: SummaryItem[];
  content?: ReasoningContent[];
  encrypted_content?: string;
}

export interface SummaryItem { type: "summary_text"; text: string; }
export interface ReasoningContent { type: "text"; text: string; }

export interface FunctionCallPayload {
  type: "function_call";
  name: string;
  arguments: string; // JSON-encoded string, NOT parsed object
  call_id: string;
}

export interface FunctionCallOutputPayload {
  type: "function_call_output";
  call_id: string;
  output: string | ContentItem[]; // Untagged union
}

export interface LocalShellCallPayload {
  type: "local_shell_call";
  call_id?: string;
  action: unknown;
  status: string;
}

export interface CustomToolCallPayload {
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input: string;
  status?: string;
}

export interface CustomToolCallOutputPayload {
  type: "custom_tool_call_output";
  call_id: string;
  output: string | ContentItem[];
}

export interface WebSearchCallPayload {
  type: "web_search_call";
  action?: unknown;
  status?: string;
}

export interface GhostSnapshotPayload {
  type: "ghost_snapshot";
  ghost_commit: unknown;
}

export interface CompactionItemPayload {
  type: "compaction";
  encrypted_content: string;
}

export interface UnknownResponseItemPayload {
  type: string;
  [key: string]: unknown;
}

// ContentItem
export type ContentItem =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "output_text"; text: string };

// TurnContext — per-turn configuration snapshot
export interface TurnContextPayload {
  turn_id?: string;
  cwd: string;
  model: string;
  effort?: string;
  approval_policy: unknown;
  sandbox_policy: unknown;
  truncation_policy?: { mode: string; limit: number };
  personality?: unknown;
  summary: unknown;
  current_date?: string;
  timezone?: string;
  network?: unknown;
  user_instructions?: string;
  instructions?: string;
  developer_instructions?: string;
  collaboration_mode?: {
    mode: string;
    settings: {
      model: string;
      reasoning_effort: string;
      developer_instructions: string;
    };
  };
  [key: string]: unknown; // Forward-compat
}

export const TURN_CONTEXT_STRUCTURAL_FIELDS = [
  "turn_id", "cwd", "model", "effort", "approval_policy",
  "sandbox_policy", "truncation_policy", "personality",
  "summary", "current_date", "timezone", "network",
] as const;

// EventMsg
export interface EventMsgPayload {
  type: string;
  [key: string]: unknown;
}

export const DEFAULT_EVENT_PRESERVE_LIST: readonly string[] = [
  "user_message", "error",
] as const;

// Compacted
export interface CompactedPayload {
  message: string;
  replacement_history?: ResponseItemPayload[];
}
```

**`src/types/tool-removal-types.ts`:**

```typescript
export interface ToolRemovalPreset {
  keepTurnsWithTools: number;
  truncatePercent: number;
}

export type ReasoningMode = "full" | "summary-only" | "none";

export interface StripConfig {
  toolPreset: ToolRemovalPreset | null;
  reasoningMode: ReasoningMode;
  stripTools: boolean;
  eventPreserveList: readonly string[];
  truncateLength: number;
}

export type StripZone = "removed" | "truncated" | "preserved";
```

**`src/types/clone-operation-types.ts`:**

```typescript
export interface TurnInfo {
  startIndex: number;
  endIndex: number;
  turnIndex: number;
  isToolBearing: boolean;
  zone: StripZone | null;
}

export interface TurnIdentificationResult {
  preTurnRecords: { startIndex: number; endIndex: number };
  turns: TurnInfo[];
  compactionDetected: boolean;
  lastCompactionIndex: number | null;
}

export interface ResolvedCloneConfig {
  sessionId: string;
  codexDir: string;
  outputPath: string | null;
  stripConfig: StripConfig;
  force: boolean;
  jsonOutput: boolean;
  verbose: boolean;
}

export interface CloneResult {
  operationSucceeded: boolean;
  clonedThreadId: string;
  clonedSessionFilePath: string;
  sourceThreadId: string;
  sourceSessionFilePath: string;
  resumable: boolean;
  statistics: CloneStatistics;
}

export interface CloneStatistics {
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

export interface StripResult {
  records: RolloutLine[];
  statistics: Omit<CloneStatistics, "fileSizeReductionPercent" | "originalSizeBytes" | "outputSizeBytes">;
}

export interface ParsedSession {
  records: RolloutLine[];
  metadata: SessionMetaPayload;
  fileSizeBytes: number;
}

export interface SessionFileInfo {
  filePath: string;
  threadId: string;
  createdAt: Date;
  fileName: string;
}

export interface SessionMetadata {
  threadId: string;
  createdAt: Date;
  cwd: string;
  cliVersion: string;
  modelProvider?: string;
  git?: GitInfo;
  firstUserMessage?: string;
  fileSizeBytes: number;
}

export interface WriteSessionOptions {
  outputPath: string | null;
  codexDir: string;
  threadId: string;
}

export interface WriteResult {
  filePath: string;
  sizeBytes: number;
  isDefaultLocation: boolean;
}

export interface ScanOptions {
  limit?: number;
}

export interface ParseOptions {
  strict: boolean;
}
```

**`src/types/configuration-types.ts`:**

```typescript
export interface CxsConfiguration {
  codexDir: string;
  defaultPreset: string;
  customPresets: Record<string, ToolRemovalPreset>;
  eventPreserveList: string[];
  truncateLength: number;
}
```

### Error Classes to Create

From Tech Design §Low Altitude — Error Classes (`src/errors/clone-operation-errors.ts`):

- `NotImplementedError` — thrown by stubs, caught during development
- `CxsError` extends `Error` — base class for all feature errors
- `SessionNotFoundError` extends `CxsError` — with `sessionId` and optional `candidates[]`
- `AmbiguousMatchError` extends `CxsError` — with `partialId` and `matches[]`
- `InvalidSessionError` extends `CxsError` — with `filePath` and `reason`
- `MalformedJsonError` extends `CxsError` — with `filePath` and `lineNumber`
- `ConfigurationError` extends `CxsError` — with `field` and message
- `ArgumentValidationError` extends `CxsError` — with `argument` and message
- `FileOperationError` extends `CxsError` — with `filePath`, `operation`, and message

All classes set `this.name` explicitly and store structured context as `public readonly` properties.

### Constants to Create

From Tech Design §Low Altitude — Constants and Preset Definitions (`src/config/tool-removal-presets.ts`):

```typescript
export const DEFAULT_TRUNCATE_LENGTH = 120;

export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = {
  default: { keepTurnsWithTools: 20, truncatePercent: 50 },
  aggressive: { keepTurnsWithTools: 10, truncatePercent: 70 },
  heavy: { keepTurnsWithTools: 10, truncatePercent: 80 },
  extreme: { keepTurnsWithTools: 0, truncatePercent: 0 },
};
```

Plus function stubs: `resolvePreset()`, `isValidPresetName()`, `listAvailablePresets()` — each throwing `NotImplementedError`.

### Test Fixtures to Create

**SessionBuilder** (`test/fixtures/builders/session-builder.ts`) — from Tech Design §Testing Strategy:

```typescript
export class SessionBuilder {
  addSessionMeta(overrides?: Partial<SessionMetaPayload>): this;
  addTurn(options?: {
    functionCalls?: number;
    localShellCalls?: number;
    customToolCalls?: number;
    webSearchCalls?: number;
    reasoning?: boolean;
    events?: string[];
  }): this;
  addCompactedRecord(): this;
  build(): RolloutLine[];
}
```

Must produce valid `RolloutLine[]` arrays with correct timestamps, proper `turn_context` records at turn boundaries, correct `call_id` pairing for `function_call`/`function_call_output` and `custom_tool_call`/`custom_tool_call_output` pairs, and standalone records for `local_shell_call` and `web_search_call`.

**Static Fixtures** (`test/fixtures/data/`):
- `basic-session.jsonl` — minimal valid session (session_meta + a few turns with messages and tool calls)
- `compacted-session.jsonl` — session with compacted records mid-stream
- `malformed-session.jsonl` — some lines with invalid JSON for parser error handling

### Config to Validate

- `package.json` with dependencies (`citty`, `c12`, `consola`, `pathe`, `zod`) and devDependencies (`@biomejs/biome`, `typescript`, `@types/bun`)
- All verification scripts: `format`, `format:check`, `lint`, `check`, `typecheck`, `test`, `red-verify`, `verify`, `green-verify`, `guard:no-test-changes`, `verify-all`, `build`
- `tsconfig.json` with strict mode, ESNext target, path aliases
- `biome.json` for lint + format rules
- Test runner configured (Bun test) and passing empty suite

### Spec Deviation

None. Checked against Tech Design: §Low Altitude — Interface Definitions (all type sections), §Low Altitude — Error Classes, §Low Altitude — Constants and Preset Definitions, §Verification Scripts, §Work Breakdown — Chunk 0.

## Technical Checklist

- [ ] All type definitions from tech design created and match §Low Altitude exactly
- [ ] Error classes match tech design signatures with structured context
- [ ] Constants (`BUILT_IN_PRESETS`, `DEFAULT_TRUNCATE_LENGTH`, `TURN_CONTEXT_STRUCTURAL_FIELDS`, `DEFAULT_EVENT_PRESERVE_LIST`) defined
- [ ] Type barrel exports all types from `src/types/index.ts`
- [ ] SessionBuilder produces valid `RolloutLine[]` for all tool types
- [ ] Static fixture files created and contain valid JSONL (except malformed)
- [ ] TypeScript compiles clean (`bun run typecheck`)
- [ ] Lint/format passes (`bun run format:check && bun run lint`)
- [ ] All verification scripts present in package.json
- [ ] Project config validated (`tsconfig.json` strict, `biome.json` configured)
- [ ] Verification: `bun run verify`
