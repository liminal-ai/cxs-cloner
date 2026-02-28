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

export interface SummaryItem {
	type: "summary_text";
	text: string;
}
export interface ReasoningContent {
	type: "text";
	text: string;
}

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
	"turn_id",
	"cwd",
	"model",
	"effort",
	"approval_policy",
	"sandbox_policy",
	"truncation_policy",
	"personality",
	"summary",
	"current_date",
	"timezone",
	"network",
] as const;

// EventMsg
export interface EventMsgPayload {
	type: string;
	[key: string]: unknown;
}

export const DEFAULT_EVENT_PRESERVE_LIST: readonly string[] = [
	"user_message",
	"error",
] as const;

// Compacted
export interface CompactedPayload {
	message: string;
	replacement_history?: ResponseItemPayload[];
}
