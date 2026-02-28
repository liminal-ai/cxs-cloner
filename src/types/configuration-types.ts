import type { ToolRemovalPreset } from "./tool-removal-types.js";

export interface CxsConfiguration {
	codexDir: string;
	defaultPreset: string;
	customPresets: Record<string, ToolRemovalPreset>;
	eventPreserveList: string[];
	truncateLength: number;
}
