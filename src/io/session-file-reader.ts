import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import consola from "consola";
import {
	InvalidSessionError,
	MalformedJsonError,
} from "../errors/clone-operation-errors.js";
import type {
	ParsedSession,
	ParseOptions,
	SessionMetadata,
	SessionStatistics,
} from "../types/clone-operation-types.js";

export type { SessionStatistics } from "../types/clone-operation-types.js";

import type {
	EventMsgPayload,
	GitInfo,
	MessagePayload,
	RolloutLine,
	SessionMetaPayload,
} from "../types/codex-session-types.js";

/**
 * Maximum lines to read for lightweight metadata extraction.
 * Codex writes session_meta first, so 100 lines is a safe cap for first-message discovery.
 */
export const METADATA_READ_LINES = 100;

/** Maximum length for first user message before truncation. */
export const MAX_MESSAGE_LENGTH = 80;

/**
 * Extract text content from a MessagePayload.
 * Concatenates all text items from the content array.
 */
function extractMessageText(payload: MessagePayload): string {
	return payload.content
		.map((item) => {
			if ("text" in item) {
				return item.text;
			}
			return "";
		})
		.join("");
}

function normalizeMessageText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function isBootstrapPrompt(text: string): boolean {
	const normalized = normalizeMessageText(text);
	return (
		normalized.startsWith("# AGENTS.md instructions for ") ||
		(normalized.includes("<INSTRUCTIONS>") &&
			normalized.includes("<environment_context>"))
	);
}

/**
 * Truncate a string to the maximum message length.
 * If truncation is needed, appends "..." to stay within the limit.
 */
function truncateMessage(text: string): string {
	if (text.length <= MAX_MESSAGE_LENGTH) {
		return text;
	}
	return `${text.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
}

/**
 * Read first N lines from a file using streaming I/O.
 * Avoids reading the entire file into memory.
 */
async function readFirstLines(
	filePath: string,
	maxLines: number,
): Promise<string[]> {
	const lines: string[] = [];

	const stream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = createInterface({
		input: stream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	for await (const line of rl) {
		if (line.trim() !== "") {
			lines.push(line);
		}
		if (lines.length >= maxLines) {
			break;
		}
	}

	rl.close();
	stream.destroy();

	return lines;
}

/**
 * Read first N lines of a session file, extract session_meta and first user message.
 * Non-strict: skips malformed JSON lines with warning.
 * First user message: looks for response_item with role="user",
 * falls back to event_msg of subtype "user_message".
 * Truncates message text to 80 characters.
 */
export async function readSessionMetadata(
	filePath: string,
): Promise<SessionMetadata> {
	const fileStat = await stat(filePath);
	const fileSizeBytes = fileStat.size;

	if (fileSizeBytes === 0) {
		throw new InvalidSessionError(filePath, "File is empty");
	}

	const lines = await readFirstLines(filePath, METADATA_READ_LINES);

	if (lines.length === 0) {
		throw new InvalidSessionError(filePath, "File is empty");
	}

	let sessionMeta: SessionMetaPayload | null = null;
	let firstUserMessage: string | undefined;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let parsed: unknown;

		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			consola.warn(`Skipping malformed JSON at line ${i + 1} in "${filePath}"`);
			continue;
		}
		if (!isRecordEnvelope(parsed)) {
			consola.warn(
				`Skipping structurally invalid record at line ${i + 1} in "${filePath}"`,
			);
			continue;
		}
		const record = parsed;

		// Extract session_meta
		if (record.type === "session_meta" && !sessionMeta) {
			sessionMeta = record.payload as SessionMetaPayload;
		}

		// Extract first user message from response_item
		if (record.type === "response_item" && firstUserMessage === undefined) {
			const payload = record.payload as { type?: string; role?: string };
			if (payload.type === "message" && payload.role === "user") {
				const msgPayload = record.payload as MessagePayload;
				const messageText = normalizeMessageText(
					extractMessageText(msgPayload),
				);
				if (messageText !== "" && !isBootstrapPrompt(messageText)) {
					firstUserMessage = truncateMessage(messageText);
				}
			}
		}

		// Track first event_msg user_message as fallback.
		if (record.type === "event_msg" && firstUserMessage === undefined) {
			const payload = record.payload as EventMsgPayload;
			if (payload.type === "user_message") {
				const rawMessage = payload.message;
				const message =
					typeof rawMessage === "string"
						? normalizeMessageText(rawMessage)
						: undefined;
				if (message && message !== "" && !isBootstrapPrompt(message)) {
					firstUserMessage = truncateMessage(message);
				}
			}
		}
	}

	if (!sessionMeta) {
		throw new InvalidSessionError(filePath, "No session_meta record found");
	}

	const git: GitInfo | undefined = sessionMeta.git
		? {
				commit_hash: sessionMeta.git.commit_hash,
				branch: sessionMeta.git.branch,
				origin_url: sessionMeta.git.origin_url,
				repository_url: sessionMeta.git.repository_url,
			}
		: undefined;

	return {
		threadId: sessionMeta.id,
		// Prefer session_meta timestamp as the authoritative creation time.
		createdAt: new Date(sessionMeta.timestamp),
		cwd: sessionMeta.cwd,
		cliVersion: sessionMeta.cli_version,
		modelProvider: sessionMeta.model_provider,
		git,
		firstUserMessage,
		fileSizeBytes,
	};
}

/** Known top-level record types. */
const KNOWN_RECORD_TYPES = new Set([
	"session_meta",
	"response_item",
	"turn_context",
	"event_msg",
	"compacted",
]);

/** Known response_item subtypes. */
const KNOWN_RESPONSE_ITEM_TYPES = new Set([
	"message",
	"function_call",
	"function_call_output",
	"reasoning",
	"local_shell_call",
	"custom_tool_call",
	"custom_tool_call_output",
	"web_search_call",
	"ghost_snapshot",
	"compaction",
]);

/**
 * Read all lines from a file using streaming I/O.
 */
async function readAllLines(filePath: string): Promise<string[]> {
	const lines: string[] = [];

	const stream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = createInterface({
		input: stream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	for await (const line of rl) {
		if (line.trim() !== "") {
			lines.push(line);
		}
	}

	rl.close();
	stream.destroy();

	return lines;
}

/**
 * Parse all lines of a JSONL session file.
 * Discriminates record types and response_item subtypes.
 * Returns ParsedSession with records[], metadata, fileSizeBytes.
 *
 * options.strict: true → abort on malformed JSON (MalformedJsonError).
 * options.strict: false (default) → skip malformed lines with warning.
 */
export async function parseSessionFile(
	filePath: string,
	options?: ParseOptions,
): Promise<ParsedSession> {
	const strict = options?.strict ?? false;
	const fileStat = await stat(filePath);
	const fileSizeBytes = fileStat.size;

	// v1 tradeoff: load all lines for simplicity/readability; can be streamed later if needed.
	const rawLines = await readAllLines(filePath);
	const records: RolloutLine[] = [];
	let metadata: SessionMetaPayload | null = null;

	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i];
		let parsed: unknown;

		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			if (strict) {
				throw new MalformedJsonError(filePath, i + 1);
			}
			consola.warn(`Skipping malformed JSON at line ${i + 1} in "${filePath}"`);
			continue;
		}
		if (!isRecordEnvelope(parsed)) {
			if (strict) {
				throw new MalformedJsonError(filePath, i + 1);
			}
			consola.warn(
				`Skipping structurally invalid record at line ${i + 1} in "${filePath}"`,
			);
			continue;
		}
		const record = parsed;

		// First-level discrimination: check if top-level type is known
		const recordType = record.type as string;
		if (!KNOWN_RECORD_TYPES.has(recordType)) {
			consola.debug(
				`Unknown record type "${recordType}" at line ${i + 1} in "${filePath}" — preserved as-is`,
			);
		}

		// For response_item: second-level discrimination on payload.type
		if (recordType === "response_item") {
			const payload = record.payload as { type?: string };
			const subtype = payload.type;
			if (subtype && !KNOWN_RESPONSE_ITEM_TYPES.has(subtype)) {
				consola.debug(
					`Unknown response_item subtype "${subtype}" at line ${i + 1} in "${filePath}" — preserved as-is`,
				);
			}
		}

		// Extract metadata from first session_meta
		if (recordType === "session_meta" && !metadata) {
			metadata = record.payload as SessionMetaPayload;
		}

		records.push(record);
	}

	if (!metadata) {
		throw new InvalidSessionError(filePath, "No session_meta record found");
	}

	return { records, metadata, fileSizeBytes };
}

function isRecordEnvelope(value: unknown): value is RolloutLine {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Record<string, unknown>;
	return (
		typeof record.timestamp === "string" &&
		typeof record.type === "string" &&
		"payload" in record
	);
}

/**
 * Compute statistics from a parsed session.
 * Counts top-level records only (not inside CompactedPayload.replacement_history).
 */
export function computeSessionStatistics(
	parsed: ParsedSession,
): SessionStatistics {
	let functionCalls = 0;
	let reasoningBlocks = 0;
	let messages = 0;
	let localShellCalls = 0;
	let customToolCalls = 0;
	let webSearchCalls = 0;
	let ghostSnapshots = 0;
	let compactionItems = 0;
	let eventMessages = 0;
	let turns = 0;
	let compactedRecords = 0;
	const compactedPositions: number[] = [];

	for (let i = 0; i < parsed.records.length; i++) {
		const record = parsed.records[i];
		const recordType = record.type as string;

		switch (recordType) {
			case "turn_context":
				turns++;
				break;
			case "event_msg":
				eventMessages++;
				break;
			case "compacted":
				compactedRecords++;
				compactedPositions.push(i + 1); // 1-indexed line number
				break;
			case "response_item": {
				const payload = record.payload as { type?: string };
				switch (payload.type) {
					case "message":
						messages++;
						break;
					case "function_call":
						functionCalls++;
						break;
					case "reasoning":
						reasoningBlocks++;
						break;
					case "local_shell_call":
						localShellCalls++;
						break;
					case "custom_tool_call":
						customToolCalls++;
						break;
					case "web_search_call":
						webSearchCalls++;
						break;
					case "ghost_snapshot":
						ghostSnapshots++;
						break;
					case "compaction":
						compactionItems++;
						break;
					// function_call_output, custom_tool_call_output, unknown: not separately counted
				}
				break;
			}
		}
	}

	return {
		functionCalls,
		reasoningBlocks,
		messages,
		localShellCalls,
		customToolCalls,
		webSearchCalls,
		ghostSnapshots,
		compactionItems,
		eventMessages,
		turns,
		compactedRecords,
		compactedPositions,
		fileSizeBytes: parsed.fileSizeBytes,
		estimatedTokens: Math.floor(parsed.fileSizeBytes / 4),
	};
}
