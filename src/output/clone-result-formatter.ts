import type { CloneResult } from "../types/clone-operation-types.js";
import { formatFileSize } from "./format-utils.js";

/**
 * Format clone result for display.
 * Human-readable or JSON based on options.
 * Shows resume command only when result.resumable is true.
 */
export function formatCloneResult(
	result: CloneResult,
	options: { json: boolean; verbose: boolean },
): string {
	if (options.json) {
		return formatJson(result);
	}
	return formatHuman(result, options.verbose);
}

function formatJson(result: CloneResult): string {
	return JSON.stringify(
		{
			success: result.operationSucceeded,
			clonedThreadId: result.clonedThreadId,
			clonedSessionFilePath: result.clonedSessionFilePath,
			sourceThreadId: result.sourceThreadId,
			sourceSessionFilePath: result.sourceSessionFilePath,
			cloneTimestamp: result.cloneTimestamp,
			cloneThreadName: result.cloneThreadName,
			sessionIndexUpdated: result.sessionIndexUpdated,
			resumable: result.resumable,
			statistics: result.statistics,
		},
		null,
		2,
	);
}

function formatHuman(result: CloneResult, verbose: boolean): string {
	const stats = result.statistics;
	const lines: string[] = [];

	lines.push("Clone completed successfully.");
	lines.push("");
	lines.push(`  Source:  ${result.sourceSessionFilePath}`);
	lines.push(`  Output:  ${result.clonedSessionFilePath}`);
	lines.push(`  Thread:  ${result.clonedThreadId}`);
	if (result.cloneThreadName) {
		lines.push(`  Name:    ${result.cloneThreadName}`);
	}
	lines.push("");
	lines.push(
		`  Size: ${formatFileSize(stats.originalSizeBytes)} → ${formatFileSize(stats.outputSizeBytes)} (${stats.fileSizeReductionPercent}% reduction)`,
	);
	lines.push(`  Turns: ${stats.turnCountOriginal} → ${stats.turnCountOutput}`);
	lines.push(
		`  Removed: ${stats.functionCallsRemoved} tool calls, ${stats.reasoningBlocksRemoved} reasoning, ${stats.eventMessagesRemoved} events, ${stats.turnContextRecordsRemoved} turn contexts, ${stats.ghostSnapshotsRemoved} ghost snapshots`,
	);

	if (verbose) {
		lines.push("");
		lines.push("  Removed:");
		lines.push(`    Tool calls:      ${stats.functionCallsRemoved}`);
		lines.push(`    Tool truncated:  ${stats.functionCallsTruncated}`);
		lines.push(`    Reasoning:       ${stats.reasoningBlocksRemoved}`);
		lines.push(`    Event messages:  ${stats.eventMessagesRemoved}`);
		lines.push(`    Turn contexts:   ${stats.turnContextRecordsRemoved}`);
		lines.push(`    Ghost snapshots: ${stats.ghostSnapshotsRemoved}`);
	}

	if (stats.compactionDetected) {
		lines.push("");
		lines.push(
			`  Compaction detected: ${stats.compactedRecordCount} compacted record(s) preserved`,
		);
	}

	lines.push("");
	lines.push(
		`  Session index: ${result.sessionIndexUpdated ? "updated" : "not updated"}`,
	);
	lines.push("");

	if (result.resumable) {
		lines.push(`  Resume with: codex resume ${result.clonedThreadId}`);
	} else {
		lines.push(
			"  Custom output path — clone will not appear in `codex resume`.",
		);
	}

	return lines.join("\n");
}
