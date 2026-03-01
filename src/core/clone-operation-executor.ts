import { randomUUID } from "node:crypto";
import consola from "consola";
import { findSessionByPartialId } from "../io/session-directory-scanner.js";
import { parseSessionFile } from "../io/session-file-reader.js";
import { writeClonedSession } from "../io/session-file-writer.js";
import type {
	CloneResult,
	CloneStatistics,
	ResolvedCloneConfig,
} from "../types/clone-operation-types.js";
import type { SessionMetaPayload } from "../types/codex-session-types.js";
import { stripRecords } from "./record-stripper.js";
import { identifyTurns } from "./turn-boundary-calculator.js";

/**
 * Orchestrate the full clone pipeline.
 *
 * Pipeline: find → parse → identify turns → strip → new ID → update meta → write → merge statistics
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
	const newThreadId = randomUUID();

	// Stage 6: Update session_meta in the stripped records
	updateSessionMeta(stripResult.records, newThreadId, parsed.metadata.id);

	// Stage 7: Write output
	const writeResult = await writeClonedSession(stripResult.records, {
		outputPath: config.outputPath,
		codexDir: config.codexDir,
		threadId: newThreadId,
	});

	// Stage 8: Merge statistics
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
		clonedThreadId: newThreadId,
		clonedSessionFilePath: writeResult.filePath,
		sourceThreadId: parsed.metadata.id,
		sourceSessionFilePath: sessionInfo.filePath,
		resumable: writeResult.isDefaultLocation,
		statistics,
	};
}

/**
 * Update session_meta record in place: set new id and forked_from_id.
 * Mutates the records array.
 */
function updateSessionMeta(
	records: { type: string; payload: unknown }[],
	newThreadId: string,
	sourceThreadId: string,
): void {
	for (const record of records) {
		if (record.type === "session_meta") {
			const payload = record.payload as SessionMetaPayload;
			payload.id = newThreadId;
			payload.forked_from_id = sourceThreadId;
			return;
		}
	}
}
