export interface ToolRemovalPreset {
	keepTurnsWithTools: number;
	truncatePercent: number;
}

export type ReasoningMode = "full" | "summary-only" | "none";

export interface StripConfig {
	toolPreset: ToolRemovalPreset | null;
	reasoningMode: ReasoningMode;
	stripTools: boolean;
	eventPreserveList: readonly string[];
	truncateLength: number;
}

export type StripZone = "removed" | "truncated" | "preserved";
