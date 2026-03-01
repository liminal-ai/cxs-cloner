import type {
	GitInfo,
	RolloutLine,
	SessionMetaPayload,
} from "./codex-session-types.js";
import type { StripConfig, StripZone } from "./tool-removal-types.js";

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
	/** Counts tool call initiation records removed, not paired output records. */
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
	statistics: Omit<
		CloneStatistics,
		"fileSizeReductionPercent" | "originalSizeBytes" | "outputSizeBytes"
	>;
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

/** Statistics computed from a parsed session. */
export interface SessionStatistics {
	functionCalls: number;
	reasoningBlocks: number;
	messages: number;
	localShellCalls: number;
	customToolCalls: number;
	webSearchCalls: number;
	ghostSnapshots: number;
	compactionItems: number;
	eventMessages: number;
	turns: number;
	compactedRecords: number;
	compactedPositions: number[];
	fileSizeBytes: number;
	estimatedTokens: number;
}
