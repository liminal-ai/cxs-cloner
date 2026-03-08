import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import consola from "consola";
import { CloneCompatibilityError } from "../errors/clone-operation-errors.js";
import { findSessionByPartialId } from "../io/session-directory-scanner.js";
import {
	appendSessionIndexEntry,
	deriveCloneThreadName,
	readSessionIndexName,
} from "../io/session-index-file.js";
import { parseSessionFile } from "../io/session-file-reader.js";
import { writeClonedSession } from "../io/session-file-writer.js";
import type {
	CloneIdentity,
	CloneResult,
	CloneStatistics,
	ResolvedCloneConfig,
	SessionIndexEntry,
} from "../types/clone-operation-types.js";
import type {
	GitInfo,
	MessagePayload,
	RolloutLine,
	SessionMetaPayload,
	TurnContextPayload,
} from "../types/codex-session-types.js";
import { probeGitInfo } from "./git-probe.js";
import {
	extractMessageText,
	isBootstrapPrompt,
	normalizeMessageText,
} from "./message-text-utils.js";
import { stripRecords } from "./record-stripper.js";
import { identifyTurns } from "./turn-boundary-calculator.js";

/**
 * Orchestrate the full clone pipeline.
 *
 * Pipeline: find → parse → identify turns → strip → new ID → compat guard →
 *   update meta → rewrite cwd → write → session index → merge statistics
 */
export async function executeCloneOperation(
	config: ResolvedCloneConfig,
): Promise<CloneResult> {
	// Stage 1: Find source session
	const sessionInfo = await findSessionByPartialId(
		config.codexDir,
		config.sessionId,
	);

	// Stage 2: Parse full session
	const parsed = await parseSessionFile(sessionInfo.filePath, {
		strict: !config.force,
	});

	// Stage 3: Identify turns
	const turnResult = identifyTurns(parsed.records);
	const toolBearingTurnCount = turnResult.turns.filter(
		(turn) => turn.isToolBearing,
	).length;
	if (config.stripConfig.stripTools && toolBearingTurnCount === 0) {
		consola.warn(
			"Session has no tool calls. Reasoning and telemetry will still be stripped.",
		);
	}

	// Stage 4: Strip records
	const stripResult = stripRecords(
		parsed.records,
		turnResult.turns,
		config.stripConfig,
	);

	// Stage 5: Generate new identity
	const cloneIdentity: CloneIdentity = {
		threadId: randomUUID(),
		cloneTimestamp: new Date(),
		sourceThreadId: parsed.metadata.id,
	};

	let indexName: string | null = null;
	try {
		indexName = await readSessionIndexName(
			config.codexDir,
			parsed.metadata.id,
		);
	} catch {
		// Non-fatal: naming is best-effort, fall back to message extraction
	}
	const sourceThreadName =
		indexName ?? findFirstUserMessageText(parsed.records);
	if (sourceThreadName) {
		cloneIdentity.threadName = deriveCloneThreadName(sourceThreadName);
	}

	// Stage 6: Ensure the clone still looks like a real interactive session
	ensureCloneUserMessageCompatibility(stripResult.records, parsed.records);

	// Stage 7: Update session_meta in the stripped records
	updateSessionMeta(stripResult.records, cloneIdentity);

	// Stage 8: Rewrite working directory metadata if target-cwd requested
	let targetCwdApplied: string | undefined;
	if (config.targetCwd) {
		const gitInfo = await probeGitInfo(config.targetCwd);
		rewriteWorkingDirectory(stripResult.records, config.targetCwd, gitInfo);
		targetCwdApplied = config.targetCwd;
	}

	// Stage 9: Write output
	const writeResult = await writeClonedSession(stripResult.records, {
		outputPath: config.outputPath,
		codexDir: config.codexDir,
		threadId: cloneIdentity.threadId,
		cloneTimestamp: cloneIdentity.cloneTimestamp,
	});

	// Stage 10: Append session index entry for default-location clones when named
	let sessionIndexUpdated = false;
	if (writeResult.isDefaultLocation && cloneIdentity.threadName) {
		const sessionIndexEntry: SessionIndexEntry = {
			id: cloneIdentity.threadId,
			thread_name: cloneIdentity.threadName,
			updated_at: cloneIdentity.cloneTimestamp.toISOString(),
		};

		try {
			await appendSessionIndexEntry(config.codexDir, sessionIndexEntry);
			sessionIndexUpdated = true;
		} catch (error) {
			await rollbackClonedSession(writeResult.filePath);
			throw error;
		}
	}

	// Stage 11: Merge statistics
	const originalSizeBytes = parsed.fileSizeBytes;
	const outputSizeBytes = writeResult.sizeBytes;
	const fileSizeReductionPercent =
		originalSizeBytes > 0
			? Math.round((1 - outputSizeBytes / originalSizeBytes) * 100)
			: 0;

	const statistics: CloneStatistics = {
		...stripResult.statistics,
		originalSizeBytes,
		outputSizeBytes,
		fileSizeReductionPercent,
	};

	return {
		operationSucceeded: true,
		clonedThreadId: cloneIdentity.threadId,
		clonedSessionFilePath: writeResult.filePath,
		sourceThreadId: parsed.metadata.id,
		sourceSessionFilePath: sessionInfo.filePath,
		cloneTimestamp: cloneIdentity.cloneTimestamp.toISOString(),
		cloneThreadName: cloneIdentity.threadName,
		targetCwdApplied,
		sessionIndexUpdated,
		resumable: writeResult.isDefaultLocation,
		statistics,
	};
}

/**
 * Update session_meta record in place: set new id, forked_from_id, and clone time.
 * Mutates the records array.
 */
function updateSessionMeta(
	records: RolloutLine[],
	cloneIdentity: CloneIdentity,
): void {
	for (const record of records) {
		if (record.type === "session_meta") {
			record.timestamp = cloneIdentity.cloneTimestamp.toISOString();
			const payload = record.payload as SessionMetaPayload;
			payload.id = cloneIdentity.threadId;
			payload.forked_from_id = cloneIdentity.sourceThreadId;
			payload.timestamp = cloneIdentity.cloneTimestamp.toISOString();
			return;
		}
	}
}

/**
 * Rewrite cwd in session_meta and all turn_context records.
 * Recompute git metadata from the target directory.
 * Mutates the records array.
 */
function rewriteWorkingDirectory(
	records: RolloutLine[],
	targetCwd: string,
	gitInfo: GitInfo | null,
): void {
	for (const record of records) {
		if (record.type === "session_meta") {
			const payload = record.payload as SessionMetaPayload;
			payload.cwd = targetCwd;
			if (gitInfo) {
				payload.git = gitInfo;
			} else {
				delete payload.git;
			}
		}

		if (record.type === "turn_context") {
			const payload = record.payload as TurnContextPayload;
			payload.cwd = targetCwd;
		}
	}
}

function hasUserMessageEvent(records: RolloutLine[]): boolean {
	return records.some(
		(record) =>
			record.type === "event_msg" &&
			(record.payload as { type?: string }).type === "user_message",
	);
}

function extractNormalizedMessageText(
	payload: MessagePayload,
): string | null {
	const text = normalizeMessageText(extractMessageText(payload));
	return text === "" ? null : text;
}

function extractTrimmedMessageText(payload: MessagePayload): string | null {
	const text = extractMessageText(payload).trim();
	return text === "" ? null : text;
}

function derivePromptTitle(text: string): string {
	const firstNonEmptyLine = text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line !== "");
	const candidate = (firstNonEmptyLine ?? text).replace(/\s+/g, " ").trim();
	if (candidate.length <= 120) {
		return candidate;
	}
	// Truncate at last word boundary before limit
	const truncated = candidate.slice(0, 117);
	const lastSpace = truncated.lastIndexOf(" ");
	const breakPoint = lastSpace > 60 ? lastSpace : 117;
	return `${candidate.slice(0, breakPoint)}...`;
}

function findFirstUserMessageText(records: RolloutLine[]): string | null {
	for (const record of records) {
		if (record.type === "response_item") {
			const payload = record.payload as { type?: string; role?: string };
			if (payload.type === "message" && payload.role === "user") {
				const messageText = extractTrimmedMessageText(
					record.payload as MessagePayload,
				);
				if (messageText && !isBootstrapPrompt(messageText)) {
					return derivePromptTitle(messageText);
				}
			}
		}

		if (record.type === "event_msg") {
			const payload = record.payload as { type?: string; message?: unknown };
			if (
				payload.type === "user_message" &&
				typeof payload.message === "string" &&
				payload.message.trim() !== ""
			) {
				const messageText = payload.message.replace(/\s+/g, " ").trim();
				if (!isBootstrapPrompt(messageText)) {
					return derivePromptTitle(messageText);
				}
			}
		}
	}

	return null;
}

function ensureCloneUserMessageCompatibility(
	outputRecords: RolloutLine[],
	sourceRecords: RolloutLine[],
): void {
	if (hasUserMessageEvent(outputRecords)) {
		return;
	}

	if (hasUserMessageEvent(sourceRecords)) {
		throw new CloneCompatibilityError(
			"stripping removed all existing user_message events from the clone output",
		);
	}

	for (let i = 0; i < outputRecords.length; i++) {
		const record = outputRecords[i];
		if (record.type !== "response_item") {
			continue;
		}

		const payload = record.payload as { type?: string; role?: string };
		if (payload.type !== "message" || payload.role !== "user") {
			continue;
		}

		const messageText = extractNormalizedMessageText(
			record.payload as MessagePayload,
		);
		if (!messageText) {
			continue;
		}

		// Skip bootstrap prompts — same filtering as naming logic
		if (isBootstrapPrompt(messageText)) {
			continue;
		}

		outputRecords.splice(i + 1, 0, {
			timestamp: record.timestamp,
			type: "event_msg",
			payload: {
				type: "user_message",
				message: messageText,
			},
		});
		return;
	}

	throw new CloneCompatibilityError(
		"clone output has no preserved user_message event and no surviving user message available for synthesis",
	);
}

async function rollbackClonedSession(filePath: string): Promise<void> {
	try {
		await unlink(filePath);
	} catch {
		consola.warn(`Rollback failed: could not delete orphaned clone at ${filePath}`);
	}
}
