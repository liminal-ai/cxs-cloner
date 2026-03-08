import type { StripResult, TurnInfo } from "../types/clone-operation-types.js";
import type {
	CustomToolCallOutputPayload,
	EventMsgPayload,
	FunctionCallOutputPayload,
	FunctionCallPayload,
	ReasoningPayload,
	RolloutLine,
	TurnContextPayload,
} from "../types/codex-session-types.js";
import {
	TURN_CONTEXT_STRUCTURAL_FIELDS,
	isReplayPreservedEvent,
} from "../types/codex-session-types.js";
import type { StripConfig, StripZone } from "../types/tool-removal-types.js";

/** Response_item subtypes that are tool calls. */
const TOOL_CALL_SUBTYPES = new Set([
	"function_call",
	"local_shell_call",
	"custom_tool_call",
	"web_search_call",
]);

/** Response_item subtypes that are paired tool outputs (by call_id). */
const PAIRED_OUTPUT_SUBTYPES = new Set([
	"function_call_output",
	"custom_tool_call_output",
]);

/** Structural fields to preserve on turn_context in preserved zone. */
const STRUCTURAL_FIELD_SET = new Set<string>(TURN_CONTEXT_STRUCTURAL_FIELDS);

/**
 * Apply zone-based stripping to session records.
 *
 * Does NOT mutate the input arrays, records, or TurnInfo objects.
 * Returns a new record array (deep clone before mutation) and statistics.
 */
export function stripRecords(
	records: RolloutLine[],
	turns: TurnInfo[],
	config: StripConfig,
): StripResult {
	// Deep clone records before any mutation
	const cloned: RolloutLine[] = structuredClone(records);

	// Statistics counters
	let functionCallsRemoved = 0;
	let functionCallsTruncated = 0;
	let reasoningBlocksRemoved = 0;
	let eventMessagesRemoved = 0;
	let turnContextRecordsRemoved = 0;
	let ghostSnapshotsRemoved = 0;
	const preserveSet = new Set(config.eventPreserveList);

	// Stage 1: Compute zones — create internal copies of TurnInfo with zones assigned
	const zonedTurns = computeZones(turns, config);

	// Build index → zone lookup for fast access
	const indexToZone = new Map<number, StripZone>();
	for (const turn of zonedTurns) {
		if (turn.zone) {
			for (let i = turn.startIndex; i < turn.endIndex; i++) {
				indexToZone.set(i, turn.zone);
			}
		}
	}

	// Build set of indices to remove
	const indicesToRemove = new Set<number>();

	if (config.stripTools && config.toolPreset) {
		// Stage 2: Removed zone — collect call_ids and remove tool records
		const removedCallIds = new Set<string>();

		for (const turn of zonedTurns) {
			if (turn.zone !== "removed") {
				continue;
			}

			for (let i = turn.startIndex; i < turn.endIndex; i++) {
				const record = cloned[i];
				if (record.type !== "response_item") {
					continue;
				}

				const payload = record.payload as { type: string; call_id?: string };
				if (TOOL_CALL_SUBTYPES.has(payload.type)) {
					// Collect call_id for paired output removal (function_call, custom_tool_call)
					if (
						payload.call_id &&
						(payload.type === "function_call" ||
							payload.type === "custom_tool_call")
					) {
						removedCallIds.add(payload.call_id);
					}
					indicesToRemove.add(i);
					functionCallsRemoved++;
				}
			}

			// Remove paired outputs by call_id
			for (let i = turn.startIndex; i < turn.endIndex; i++) {
				const record = cloned[i];
				if (record.type !== "response_item") {
					continue;
				}

				const payload = record.payload as { type: string; call_id?: string };
				if (
					PAIRED_OUTPUT_SUBTYPES.has(payload.type) &&
					payload.call_id &&
					removedCallIds.has(payload.call_id)
				) {
					indicesToRemove.add(i);
				}
			}
		}

		// Stage 3: Truncated zone — truncate tool outputs and arguments
		for (const turn of zonedTurns) {
			if (turn.zone !== "truncated") {
				continue;
			}

			for (let i = turn.startIndex; i < turn.endIndex; i++) {
				const record = cloned[i];
				if (record.type !== "response_item") {
					continue;
				}

				const payload = record.payload as { type: string };

				if (
					payload.type === "function_call_output" ||
					payload.type === "custom_tool_call_output"
				) {
					truncateOutput(
						record.payload as
							| FunctionCallOutputPayload
							| CustomToolCallOutputPayload,
						config.truncateLength,
					);
					functionCallsTruncated++;
				}

				if (payload.type === "function_call") {
					truncateArguments(
						record.payload as FunctionCallPayload,
						config.truncateLength,
					);
				}
			}
		}
	}

	// Stage 4: Apply reasoning stripping globally (mode-dependent)
	if (config.reasoningMode !== "none") {
		for (let i = 0; i < cloned.length; i++) {
			const record = cloned[i];
			if (record.type !== "response_item") {
				continue;
			}

			const payload = record.payload as { type: string };

			// compaction response_items are NEVER treated as reasoning
			if (payload.type === "compaction") {
				continue;
			}

			if (payload.type === "reasoning") {
				if (config.reasoningMode === "full") {
					indicesToRemove.add(i);
					reasoningBlocksRemoved++;
				} else if (config.reasoningMode === "summary-only") {
					const rPayload = record.payload as ReasoningPayload;
					// Safe: mutating a structured clone, never the original parsed records.
					delete rPayload.content;
					delete rPayload.encrypted_content;
				}
			}
		}
	}

	// Stage 5: If tool stripping active, strip telemetry/context/ghost
	if (config.stripTools) {
		for (let i = 0; i < cloned.length; i++) {
			const record = cloned[i];

			// 5a: Strip event_msg records not in preserve-list
			if (record.type === "event_msg") {
				const eventPayload = record.payload as EventMsgPayload;
				if (
					!preserveSet.has(eventPayload.type) &&
					!isReplayPreservedEvent(eventPayload)
				) {
					indicesToRemove.add(i);
					eventMessagesRemoved++;
				}
				continue;
			}

			// 5b: Strip turn_context records per zone
			if (record.type === "turn_context") {
				const zone = indexToZone.get(i);
				if (zone === "removed" || zone === "truncated") {
					indicesToRemove.add(i);
					turnContextRecordsRemoved++;
				} else if (zone === "preserved") {
					stripTurnContextInstructions(record.payload as TurnContextPayload);
				}
				// turn_context in pre-turn range (no zone) — preserve as-is
				continue;
			}

			// 5c: Remove ghost_snapshot response_items
			if (record.type === "response_item") {
				const payload = record.payload as { type: string };
				if (payload.type === "ghost_snapshot") {
					indicesToRemove.add(i);
					ghostSnapshotsRemoved++;
				}
			}
		}
	}

	// Stage 6: Build output array, then remove empty turns
	let outputRecords = cloned.filter((_, i) => !indicesToRemove.has(i));

	// Remove empty turns: turns whose remaining records have no message content
	const emptyTurnIndices = findEmptyTurnIndices(
		cloned,
		indicesToRemove,
		zonedTurns,
		preserveSet,
	);
	if (emptyTurnIndices.size > 0) {
		// Re-filter from cloned using the combined removal set
		const combinedRemoval = new Set(indicesToRemove);
		for (const idx of emptyTurnIndices) {
			combinedRemoval.add(idx);
		}
		outputRecords = cloned.filter((_, i) => !combinedRemoval.has(i));

		// Count additional removals for statistics
		for (const idx of emptyTurnIndices) {
			const record = cloned[idx];
			if (record.type === "turn_context") {
				turnContextRecordsRemoved++;
			}
			if (record.type === "event_msg") {
				eventMessagesRemoved++;
			}
		}
	}

	// Count turns in output
	const outputTurnCount = outputRecords.filter(
		(r) => r.type === "turn_context",
	).length;

	return {
		records: outputRecords,
		statistics: {
			turnCountOriginal: turns.length,
			turnCountOutput: outputTurnCount,
			functionCallsRemoved,
			functionCallsTruncated,
			reasoningBlocksRemoved,
			eventMessagesRemoved,
			turnContextRecordsRemoved,
			ghostSnapshotsRemoved,
			compactionDetected: cloned.some((r) => isCompactionRecord(r)),
			compactedRecordCount: cloned.filter((r) => isCompactionRecord(r)).length,
		},
	};
}

// ---------- Internal helpers ----------

interface ZonedTurnInfo extends TurnInfo {
	zone: StripZone | null;
}

/** Compute zones for tool-bearing turns based on preset parameters. */
function computeZones(turns: TurnInfo[], config: StripConfig): ZonedTurnInfo[] {
	const result: ZonedTurnInfo[] = turns.map((t) => ({ ...t }));

	if (!config.stripTools || !config.toolPreset) {
		return result;
	}

	const { keepTurnsWithTools, truncatePercent } = config.toolPreset;

	// Collect tool-bearing turns (maintaining original order = chronological)
	const toolBearingIndices: number[] = [];
	for (let i = 0; i < result.length; i++) {
		if (result[i].isToolBearing) {
			toolBearingIndices.push(i);
		}
	}

	const totalToolTurns = toolBearingIndices.length;

	if (totalToolTurns < keepTurnsWithTools) {
		// Fewer tool-bearing turns than the keep threshold → all preserved
		for (const idx of toolBearingIndices) {
			result[idx].zone = "preserved";
		}
		return result;
	}

	// Zone boundaries computed from the END (newest):
	// - Newest `preservedCount` → preserved
	// - Next `truncatedCount` → truncated
	// - Everything older → removed
	const truncatedCount = Math.floor(
		(truncatePercent / 100) * keepTurnsWithTools,
	);
	const preservedCount = keepTurnsWithTools - truncatedCount;

	for (let i = 0; i < toolBearingIndices.length; i++) {
		const turnIdx = toolBearingIndices[i];
		const distFromEnd = totalToolTurns - 1 - i;

		if (distFromEnd < preservedCount) {
			result[turnIdx].zone = "preserved";
		} else if (distFromEnd < preservedCount + truncatedCount) {
			result[turnIdx].zone = "truncated";
		} else {
			result[turnIdx].zone = "removed";
		}
	}

	return result;
}

/** Truncate tool output content (string or ContentItem[] form). */
function truncateOutput(
	payload: FunctionCallOutputPayload | CustomToolCallOutputPayload,
	maxLength: number,
): void {
	if (typeof payload.output === "string") {
		if (payload.output.length > maxLength) {
			payload.output = payload.output.slice(0, maxLength) + "...";
		}
	} else if (Array.isArray(payload.output)) {
		for (const item of payload.output) {
			if ("text" in item && typeof item.text === "string") {
				if (item.text.length > maxLength) {
					(item as { text: string }).text =
						item.text.slice(0, maxLength) + "...";
				}
			}
		}
	}
}

/** Truncate function_call arguments (parse JSON → truncate string values → re-serialize). */
function truncateArguments(
	payload: FunctionCallPayload,
	maxLength: number,
): void {
	if (!payload.arguments) {
		return;
	}

	try {
		const parsed: unknown = JSON.parse(payload.arguments);
		truncateStringValues(parsed, maxLength);
		payload.arguments = JSON.stringify(parsed);
	} catch {
		// Invalid JSON — preserve as-is (defensive fallback)
	}
}

/** Recursively truncate string values in an object/array. */
function truncateStringValues(obj: unknown, maxLength: number): void {
	if (obj === null || typeof obj !== "object") {
		return;
	}

	if (Array.isArray(obj)) {
		for (let i = 0; i < obj.length; i++) {
			if (typeof obj[i] === "string" && obj[i].length > maxLength) {
				obj[i] = obj[i].slice(0, maxLength) + "...";
			} else {
				truncateStringValues(obj[i], maxLength);
			}
		}
	} else {
		const record = obj as Record<string, unknown>;
		for (const key of Object.keys(record)) {
			if (typeof record[key] === "string") {
				const str = record[key] as string;
				if (str.length > maxLength) {
					record[key] = str.slice(0, maxLength) + "...";
				}
			} else {
				truncateStringValues(record[key], maxLength);
			}
		}
	}
}

/** Strip instruction fields from a turn_context payload in the preserved zone. */
function stripTurnContextInstructions(payload: TurnContextPayload): void {
	for (const key of Object.keys(payload)) {
		if (!STRUCTURAL_FIELD_SET.has(key)) {
			delete (payload as Record<string, unknown>)[key];
		}
	}
}

/**
 * Find original indices of records belonging to empty turns.
 * An empty turn is one where, after removing indicesToRemove entries,
 * no `message` response_items remain within the turn's range.
 */
function findEmptyTurnIndices(
	cloned: RolloutLine[],
	indicesToRemove: Set<number>,
	zonedTurns: ZonedTurnInfo[],
	preserveSet: Set<string>,
): Set<number> {
	const emptyIndices = new Set<number>();

	for (const turn of zonedTurns) {
		// Only removed-zone turns can become empty due to tool stripping
		if (turn.zone !== "removed") {
			continue;
		}

		// Check if this turn has any remaining message response_items
		let hasMessage = false;
		const turnIndicesNotRemoved: number[] = [];

		for (let i = turn.startIndex; i < turn.endIndex; i++) {
			if (indicesToRemove.has(i)) {
				continue;
			}
			turnIndicesNotRemoved.push(i);

			const record = cloned[i];
			if (record.type === "response_item") {
				const payload = record.payload as { type: string };
				if (payload.type === "message") {
					hasMessage = true;
				}
			} else if (record.type === "event_msg") {
				const eventPayload = record.payload as EventMsgPayload;
				if (
					preserveSet.has(eventPayload.type) ||
					isReplayPreservedEvent(eventPayload)
				) {
					hasMessage = true;
				}
			}
		}

		if (!hasMessage && turnIndicesNotRemoved.length > 0) {
			// This turn is empty — mark all remaining records for removal
			for (const idx of turnIndicesNotRemoved) {
				emptyIndices.add(idx);
			}
		}
	}

	return emptyIndices;
}

function isCompactionRecord(record: RolloutLine): boolean {
	return (
		record.type === "compacted" ||
		(record.type === "response_item" &&
			(record.payload as { type?: string }).type === "compaction")
	);
}
