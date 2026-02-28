import { NotImplementedError } from "../errors/clone-operation-errors.js";
import type { ToolRemovalPreset } from "../types/tool-removal-types.js";

export const DEFAULT_TRUNCATE_LENGTH = 120;

export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = {
	default: { keepTurnsWithTools: 20, truncatePercent: 50 },
	aggressive: { keepTurnsWithTools: 10, truncatePercent: 70 },
	heavy: { keepTurnsWithTools: 10, truncatePercent: 80 },
	extreme: { keepTurnsWithTools: 0, truncatePercent: 0 },
};

/** Resolve a preset name to a ToolRemovalPreset, checking built-in and custom presets. */
export function resolvePreset(
	_name: string,
	_customPresets?: Record<string, ToolRemovalPreset>,
): ToolRemovalPreset {
	throw new NotImplementedError("resolvePreset");
}

/** Check whether a preset name is valid (built-in or custom). */
export function isValidPresetName(
	_name: string,
	_customPresets?: Record<string, ToolRemovalPreset>,
): boolean {
	throw new NotImplementedError("isValidPresetName");
}

/** List all available preset names (built-in + custom). */
export function listAvailablePresets(
	_customPresets?: Record<string, ToolRemovalPreset>,
): string[] {
	throw new NotImplementedError("listAvailablePresets");
}
