import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	type Stats,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const PREVIEW_LENGTH = 50;
export const ESTIMATED_TOKEN_COUNT_HEURISTIC = "ceil(raw_json_characters/4)";

export type LlmTurnCountSource =
	| "turn_context"
	| "task_started"
	| "assistant_activity";

export interface TurnSummary {
	userPromptPreview: string;
	finalModelMessagePreview: string;
	estimatedTokenCount: number;
	recordCount: number;
}

export interface SessionSummary {
	filePath: string;
	fileSizeBytes: number;
	recordCount: number;
	llmTurnCount: number;
	llmTurnCountSource: LlmTurnCountSource;
	agenticTurnCount: number;
	estimatedSessionTokenCount: number;
	estimatedTokenCountHeuristic: string;
	estimatedTokenCountByObjectType: Record<string, number>;
	turnSummaries: TurnSummary[];
}

interface JsonlRecord {
	lineNumber: number;
	estimatedTokens: number;
	timestamp?: string;
	type: string;
	payload?: Record<string, unknown>;
}

interface UserPromptBoundary {
	index: number;
	text: string;
}

interface UserPromptCandidate extends UserPromptBoundary {
	normalizedText: string;
	source: "event_msg" | "response_item";
}

const PROJECT_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
const DEFAULT_SAMPLE_DIR = path.resolve(
	PROJECT_ROOT,
	"..",
	"samples",
	"codex-jsonl",
);
const DEFAULT_FIXTURE_DIR = path.resolve(PROJECT_ROOT, "tests", "fixtures");

export function getDefaultSampleDir(): string {
	return DEFAULT_SAMPLE_DIR;
}

export function getDefaultFixtureDir(): string {
	return DEFAULT_FIXTURE_DIR;
}

export function listJsonlFiles(directoryPath: string): string[] {
	if (!existsSync(directoryPath)) {
		return [];
	}

	return readFileSyncDirectory(directoryPath)
		.filter((entry) => entry.endsWith(".jsonl"))
		.sort((left, right) => left.localeCompare(right));
}

export function listSampleRollouts(): string[] {
	return listJsonlFiles(DEFAULT_SAMPLE_DIR);
}

export function listFixtureRollouts(): string[] {
	return listJsonlFiles(DEFAULT_FIXTURE_DIR);
}

export function resolveSamplePath(fileName: string): string {
	return path.resolve(DEFAULT_SAMPLE_DIR, fileName);
}

export function resolveFixturePath(fileName: string): string {
	return path.resolve(DEFAULT_FIXTURE_DIR, fileName);
}

export function estimateTokenCount(rawText: string): number {
	return Math.max(1, Math.ceil(rawText.length / 4));
}

export function truncatePreview(text: string, maxLength = PREVIEW_LENGTH): string {
	const normalized = normalizeWhitespace(text);

	if (normalized.length <= maxLength) {
		return normalized;
	}

	if (maxLength <= 3) {
		return normalized.slice(0, maxLength);
	}

	return `${normalized.slice(0, maxLength - 3)}...`;
}

export function summarizeSession(inputPath: string): SessionSummary {
	const resolvedPath = path.resolve(inputPath);
	const { fileStats, rawContent } = readSessionFile(resolvedPath);
	const records = parseJsonl(rawContent);
	const llmTurnCount = inferLlmTurnCount(records);
	const estimatedTokenCountByObjectType = buildTokenBreakdown(records);
	const estimatedSessionTokenCount = Object.values(
		estimatedTokenCountByObjectType,
	).reduce((total, tokenCount) => total + tokenCount, 0);
	const turnSummaries = buildAgenticTurnSummaries(records);

	return {
		filePath: resolvedPath,
		fileSizeBytes: fileStats.size,
		recordCount: records.length,
		llmTurnCount: llmTurnCount.count,
		llmTurnCountSource: llmTurnCount.source,
		agenticTurnCount: turnSummaries.length,
		estimatedSessionTokenCount,
		estimatedTokenCountHeuristic: ESTIMATED_TOKEN_COUNT_HEURISTIC,
		estimatedTokenCountByObjectType,
		turnSummaries,
	};
}

function readSessionFile(
	resolvedPath: string,
): { fileStats: Stats; rawContent: string } {
	if (!existsSync(resolvedPath)) {
		throw new Error(`Input file does not exist: ${resolvedPath}`);
	}

	const fileStats = statSync(resolvedPath);

	if (!fileStats.isFile()) {
		throw new Error(`Input path is not a file: ${resolvedPath}`);
	}

	if (fileStats.size > MAX_INPUT_BYTES) {
		throw new Error(
			`Input file exceeds 10 MB limit: ${resolvedPath} (${fileStats.size} bytes)`,
		);
	}

	const rawBuffer = readFileSync(resolvedPath);

	try {
		return {
			fileStats,
			rawContent: new TextDecoder("utf-8", { fatal: true }).decode(rawBuffer),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown UTF-8 decode error";
		throw new Error(`Input file is not valid UTF-8: ${resolvedPath} (${message})`);
	}
}

function parseJsonl(rawContent: string): JsonlRecord[] {
	const records: JsonlRecord[] = [];
	let lineStart = 0;
	let lineNumber = 1;

	for (let index = 0; index <= rawContent.length; index += 1) {
		const atEnd = index === rawContent.length;

		if (!atEnd && rawContent[index] !== "\n") {
			continue;
		}

		let lineEnd = index;

		if (lineEnd > lineStart && rawContent[lineEnd - 1] === "\r") {
			lineEnd -= 1;
		}

		const rawLine = rawContent.slice(lineStart, lineEnd).trim();
		lineStart = index + 1;

		if (rawLine.length === 0) {
			if (!atEnd) {
				lineNumber += 1;
			}
			continue;
		}

		let parsed: Record<string, unknown>;

		try {
			parsed = JSON.parse(rawLine) as Record<string, unknown>;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown JSON parse error";
			throw new Error(`Invalid JSON on line ${lineNumber}: ${message}`);
		}

		records.push({
			lineNumber,
			estimatedTokens: estimateTokenCount(rawLine),
			timestamp:
				typeof parsed.timestamp === "string" ? parsed.timestamp : undefined,
			type: typeof parsed.type === "string" ? parsed.type : "unknown",
			payload:
				parsed.payload && typeof parsed.payload === "object"
					? (parsed.payload as Record<string, unknown>)
					: undefined,
		});

		if (!atEnd) {
			lineNumber += 1;
		}
	}

	return records;
}

function buildTokenBreakdown(records: JsonlRecord[]): Record<string, number> {
	const totals = new Map<string, number>();

	for (const record of records) {
		totals.set(
			record.type,
			(totals.get(record.type) ?? 0) + record.estimatedTokens,
		);
	}

	return Object.fromEntries(
		[...totals.entries()].sort(([left], [right]) => left.localeCompare(right)),
	);
}

function buildAgenticTurnSummaries(records: JsonlRecord[]): TurnSummary[] {
	const userPromptBoundaries = collectUserPromptBoundaries(records);

	return userPromptBoundaries.map((boundary, index) => {
		const endIndex =
			userPromptBoundaries[index + 1]?.index ?? records.length;
		let estimatedTokenCount = 0;
		let finalModelMessage = "";

		for (let cursor = boundary.index; cursor < endIndex; cursor += 1) {
			const record = records[cursor];
			estimatedTokenCount += record.estimatedTokens;
			const modelMessage = extractModelMessageText(record);

			if (modelMessage.length > 0) {
				finalModelMessage = modelMessage;
			}
		}

		return {
			userPromptPreview: truncatePreview(boundary.text),
			finalModelMessagePreview: truncatePreview(finalModelMessage),
			estimatedTokenCount,
			recordCount: endIndex - boundary.index,
		};
	});
}

function collectUserPromptBoundaries(records: JsonlRecord[]): UserPromptBoundary[] {
	const candidates = collectUserPromptCandidates(records);
	const boundaries: UserPromptCandidate[] = [];

	for (const candidate of candidates) {
		const previousBoundary = boundaries.at(-1);

		if (
			previousBoundary &&
			isDuplicateUserPromptCandidate(previousBoundary, candidate, records)
		) {
			continue;
		}

		boundaries.push(candidate);
	}

	return boundaries.map(({ index, text }) => ({ index, text }));
}

function collectUserPromptCandidates(records: JsonlRecord[]): UserPromptCandidate[] {
	const candidates: UserPromptCandidate[] = [];

	for (let index = 0; index < records.length; index += 1) {
		const eventText = extractEventUserMessage(records[index]);

		if (eventText.length > 0) {
			candidates.push({
				index,
				text: eventText,
				normalizedText: normalizeWhitespace(eventText),
				source: "event_msg",
			});
		}

		const fallbackText = extractFallbackUserMessage(records[index]);

		if (fallbackText.length > 0) {
			candidates.push({
				index,
				text: fallbackText,
				normalizedText: normalizeWhitespace(fallbackText),
				source: "response_item",
			});
		}
	}

	return candidates.sort((left, right) => left.index - right.index);
}

function isDuplicateUserPromptCandidate(
	previous: UserPromptCandidate,
	current: UserPromptCandidate,
	records: JsonlRecord[],
): boolean {
	if (previous.source === current.source) {
		return false;
	}

	if (previous.normalizedText !== current.normalizedText) {
		return false;
	}

	for (let cursor = previous.index + 1; cursor < current.index; cursor += 1) {
		if (!isIgnorableDuplicateSeparator(records[cursor])) {
			return false;
		}
	}

	return true;
}

function isIgnorableDuplicateSeparator(record: JsonlRecord): boolean {
	return record.type === "event_msg" && record.payload?.type === "token_count";
}

function inferLlmTurnCount(records: JsonlRecord[]): {
	count: number;
	source: LlmTurnCountSource;
} {
	const turnStartIndexes = collectExplicitTurnStartIndexes(records);

	if (turnStartIndexes) {
		return {
			count: countAssistantBackedTurns(records, turnStartIndexes.indexes),
			source: turnStartIndexes.source,
		};
	}

	return {
		count: countAssistantActivityBursts(records),
		source: "assistant_activity",
	};
}

function collectExplicitTurnStartIndexes(records: JsonlRecord[]): {
	indexes: number[];
	source: Exclude<LlmTurnCountSource, "assistant_activity">;
} | null {
	const turnContextIndexes = records
		.map((record, index) => (record.type === "turn_context" ? index : -1))
		.filter((index) => index >= 0);

	if (turnContextIndexes.length > 0) {
		return {
			indexes: turnContextIndexes,
			source: "turn_context",
		};
	}

	const taskStartedIndexes = records
		.map((record, index) =>
			record.type === "event_msg" && record.payload?.type === "task_started"
				? index
				: -1,
		)
		.filter((index) => index >= 0);

	if (taskStartedIndexes.length > 0) {
		return {
			indexes: taskStartedIndexes,
			source: "task_started",
		};
	}

	return null;
}

function countAssistantBackedTurns(
	records: JsonlRecord[],
	turnStartIndexes: number[],
): number {
	let llmTurnCount = 0;

	for (let index = 0; index < turnStartIndexes.length; index += 1) {
		const startIndex = turnStartIndexes[index];
		const endIndex = turnStartIndexes[index + 1] ?? records.length;

		if (hasAssistantActivity(records, startIndex, endIndex)) {
			llmTurnCount += 1;
		}
	}

	return llmTurnCount;
}

function countAssistantActivityBursts(records: JsonlRecord[]): number {
	let llmTurnCount = 0;
	let previousWasAssistantActivity = false;

	for (const record of records) {
		const assistantActivity = isAssistantActivity(record);

		if (assistantActivity && !previousWasAssistantActivity) {
			llmTurnCount += 1;
		}

		previousWasAssistantActivity = assistantActivity;
	}

	return llmTurnCount;
}

function hasAssistantActivity(
	records: JsonlRecord[],
	startIndex: number,
	endIndex: number,
): boolean {
	for (let index = startIndex; index < endIndex; index += 1) {
		if (isAssistantActivity(records[index])) {
			return true;
		}
	}

	return false;
}

function isAssistantActivity(record: JsonlRecord): boolean {
	if (record.type === "event_msg") {
		return (
			record.payload?.type === "agent_message" ||
			record.payload?.type === "agent_reasoning" ||
			record.payload?.type === "task_complete"
		);
	}

	if (record.type !== "response_item" || !record.payload) {
		return false;
	}

	if (record.payload.type === "message" && record.payload.role === "assistant") {
		return true;
	}

	return (
		record.payload.type === "reasoning" ||
		record.payload.type === "function_call" ||
		record.payload.type === "custom_tool_call"
	);
}

function extractEventUserMessage(record: JsonlRecord): string {
	if (record.type !== "event_msg") {
		return "";
	}

	if (record.payload?.type !== "user_message") {
		return "";
	}

	return typeof record.payload.message === "string" ? record.payload.message : "";
}

function extractFallbackUserMessage(record: JsonlRecord): string {
	if (record.type !== "response_item") {
		return "";
	}

	if (record.payload?.type !== "message" || record.payload.role !== "user") {
		return "";
	}

	const text = extractResponseItemMessageText(record);

	if (
		text.startsWith("# AGENTS.md instructions for ") &&
		text.includes("<INSTRUCTIONS>")
	) {
		return "";
	}

	return text;
}

function extractModelMessageText(record: JsonlRecord): string {
	if (record.type === "event_msg") {
		if (record.payload?.type === "agent_message") {
			return typeof record.payload.message === "string"
				? record.payload.message
				: "";
		}

		if (record.payload?.type === "task_complete") {
			if (typeof record.payload.last_agent_message === "string") {
				return record.payload.last_agent_message;
			}

			if (typeof record.payload.message === "string") {
				return record.payload.message;
			}
		}
	}

	return extractResponseItemMessageText(record, "assistant");
}

function extractResponseItemMessageText(
	record: JsonlRecord,
	expectedRole?: "assistant" | "user",
): string {
	if (record.type !== "response_item") {
		return "";
	}

	if (record.payload?.type !== "message") {
		return "";
	}

	if (expectedRole && record.payload.role !== expectedRole) {
		return "";
	}

	const content = record.payload.content;

	if (!Array.isArray(content)) {
		return "";
	}

	return normalizeWhitespace(
		content
			.map((entry) => {
				if (!entry || typeof entry !== "object") {
					return "";
				}

				if (typeof (entry as { text?: unknown }).text === "string") {
					return (entry as { text: string }).text;
				}

				if (typeof (entry as { transcript?: unknown }).transcript === "string") {
					return (entry as { transcript: string }).transcript;
				}

				return "";
			})
			.filter((text) => text.length > 0)
			.join("\n"),
	);
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function readFileSyncDirectory(directoryPath: string): string[] {
	return readdirSync(directoryPath, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
}
