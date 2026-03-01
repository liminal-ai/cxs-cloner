import type {
	TurnIdentificationResult,
	TurnInfo,
} from "../types/clone-operation-types.js";
import type { RolloutLine } from "../types/codex-session-types.js";

/** Response_item subtypes that classify a turn as tool-bearing. */
const TOOL_BEARING_SUBTYPES = new Set([
	"function_call",
	"local_shell_call",
	"custom_tool_call",
	"web_search_call",
]);

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
export function identifyTurns(
	records: RolloutLine[],
): TurnIdentificationResult {
	// Step 1: Find the last compacted record (top-level type: "compacted")
	let lastCompactionIndex: number | null = null;
	for (let i = 0; i < records.length; i++) {
		if (records[i].type === "compacted") {
			lastCompactionIndex = i;
		}
	}

	const compactionDetected = lastCompactionIndex !== null;

	// Step 2: Identify qualifying turn_context records (after last compaction)
	const qualifyingIndices: number[] = [];
	const searchStart =
		lastCompactionIndex !== null ? lastCompactionIndex + 1 : 0;

	for (let i = searchStart; i < records.length; i++) {
		if (records[i].type === "turn_context") {
			qualifyingIndices.push(i);
		}
	}

	// Step 3 & 4: Build turn boundaries and determine pre-turn range
	const firstTurnStart =
		qualifyingIndices.length > 0 ? qualifyingIndices[0] : records.length;

	const preTurnRecords = {
		startIndex: 0,
		endIndex: firstTurnStart,
	};

	// Step 3: Build turns from qualifying turn_context positions
	const turns: TurnInfo[] = [];
	for (let i = 0; i < qualifyingIndices.length; i++) {
		const startIndex = qualifyingIndices[i];
		const endIndex =
			i + 1 < qualifyingIndices.length
				? qualifyingIndices[i + 1]
				: records.length;

		// Step 5: Classify tool-bearing
		const isToolBearing = hasToolBearingRecord(records, startIndex, endIndex);

		turns.push({
			startIndex,
			endIndex,
			turnIndex: i,
			isToolBearing,
			zone: null,
		});
	}

	return {
		preTurnRecords,
		turns,
		compactionDetected,
		lastCompactionIndex,
	};
}

/**
 * Check if any response_item within [startIndex, endIndex) has a tool-bearing subtype.
 */
function hasToolBearingRecord(
	records: RolloutLine[],
	startIndex: number,
	endIndex: number,
): boolean {
	for (let i = startIndex; i < endIndex; i++) {
		const record = records[i];
		if (record.type === "response_item") {
			const payload = record.payload as { type?: string };
			if (payload.type && TOOL_BEARING_SUBTYPES.has(payload.type)) {
				return true;
			}
		}
	}
	return false;
}
