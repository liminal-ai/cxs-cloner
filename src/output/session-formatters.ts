import type {
	SessionMetadata,
	SessionStatistics,
} from "../types/clone-operation-types.js";
import type { GitInfo } from "../types/codex-session-types.js";
import { formatFileSize, formatNumber } from "./format-utils.js";

export interface SessionListFormatterOptions {
	json: boolean;
	verbose: boolean;
}

export interface SessionInfoFormatterOptions {
	json: boolean;
	verbose: boolean;
}

export interface SessionInfoData {
	threadId: string;
	cwd: string;
	cliVersion: string;
	modelProvider?: string;
	git?: GitInfo;
	stats: SessionStatistics;
}

/** Format list command output as JSON or human-readable text. */
export function formatSessionList(
	metadataList: SessionMetadata[],
	options: SessionListFormatterOptions,
): string {
	if (options.json) {
		const jsonData = metadataList.map((metadata) => ({
			...metadata,
			createdAt: metadata.createdAt.toISOString(),
		}));
		return JSON.stringify(jsonData, null, 2);
	}

	if (metadataList.length === 0) {
		return "No sessions found.";
	}

	const lines: string[] = [];
	for (const meta of metadataList) {
		const shortId = meta.threadId.slice(0, 8);
		const date = meta.createdAt.toISOString().slice(0, 19).replace("T", " ");
		const size = formatFileSize(meta.fileSizeBytes);
		const message = meta.firstUserMessage ?? "(no message)";

		let line = `${shortId}  ${date}  ${size}  ${meta.cwd}  ${message}`;
		if (options.verbose) {
			const parts: string[] = [];
			if (meta.modelProvider) {
				parts.push(`model: ${meta.modelProvider}`);
			}
			if (meta.git?.branch) {
				parts.push(`branch: ${meta.git.branch}`);
			}
			if (parts.length > 0) {
				line += `\n         ${parts.join("  ")}`;
			}
		}

		lines.push(line);
	}

	return lines.join("\n");
}

/** Format info command output as JSON or human-readable text. */
export function formatSessionInfo(
	data: SessionInfoData,
	options: SessionInfoFormatterOptions,
): string {
	if (options.json) {
		return JSON.stringify(
			{
				threadId: data.threadId,
				cwd: data.cwd,
				cliVersion: data.cliVersion,
				modelProvider: data.modelProvider,
				git: data.git,
				...data.stats,
			},
			null,
			2,
		);
	}

	const lines: string[] = [];
	lines.push(`Session: ${data.threadId}`);
	lines.push(`  cwd: ${data.cwd}`);
	lines.push(`  cli_version: ${data.cliVersion}`);
	if (data.modelProvider) {
		lines.push(`  model_provider: ${data.modelProvider}`);
	}
	if (data.git?.branch) {
		lines.push(`  git branch: ${data.git.branch}`);
	}

	lines.push("");
	lines.push(`Turns: ${data.stats.turns}`);
	lines.push(
		`File size: ${formatFileSize(data.stats.fileSizeBytes)} (~${formatNumber(data.stats.estimatedTokens)} tokens)`,
	);

	if (data.stats.compactedRecords > 0) {
		lines.push(
			`Compacted records: ${data.stats.compactedRecords} at positions [${data.stats.compactedPositions.join(", ")}]`,
		);
	} else {
		lines.push("Compacted: none");
	}

	lines.push("");
	lines.push(
		`Records: ${data.stats.functionCalls} tool calls, ${data.stats.reasoningBlocks} reasoning, ${data.stats.eventMessages} events, ${data.stats.messages} messages`,
	);

	if (options.verbose) {
		lines.push("");
		lines.push("Record breakdown:");
		appendIfNonZero(lines, "  Messages", data.stats.messages);
		appendIfNonZero(lines, "  Function calls", data.stats.functionCalls);
		appendIfNonZero(lines, "  Reasoning blocks", data.stats.reasoningBlocks);
		appendIfNonZero(lines, "  Local shell calls", data.stats.localShellCalls);
		appendIfNonZero(lines, "  Custom tool calls", data.stats.customToolCalls);
		appendIfNonZero(lines, "  Web search calls", data.stats.webSearchCalls);
		appendIfNonZero(lines, "  Ghost snapshots", data.stats.ghostSnapshots);
		appendIfNonZero(lines, "  Compaction items", data.stats.compactionItems);
		appendIfNonZero(lines, "  Event messages", data.stats.eventMessages);
	}

	return lines.join("\n");
}

function appendIfNonZero(lines: string[], label: string, value: number): void {
	if (value > 0) {
		lines.push(`${label}: ${value}`);
	}
}
