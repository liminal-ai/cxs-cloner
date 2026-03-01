import { ConfigurationError } from "../errors/clone-operation-errors.js";
import type { ToolRemovalPreset } from "../types/tool-removal-types.js";

export const DEFAULT_TRUNCATE_LENGTH = 120;

export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = {
	default: { keepTurnsWithTools: 20, truncatePercent: 50 },
	aggressive: { keepTurnsWithTools: 10, truncatePercent: 70 },
	heavy: { keepTurnsWithTools: 10, truncatePercent: 80 },
	extreme: { keepTurnsWithTools: 0, truncatePercent: 0 },
};

/** Resolve a preset name to a ToolRemovalPreset, checking custom presets first, then built-in. */
export function resolvePreset(
	name: string,
	customPresets?: Record<string, ToolRemovalPreset>,
): ToolRemovalPreset {
	if (customPresets?.[name]) {
		return customPresets[name];
	}
	if (BUILT_IN_PRESETS[name]) {
		return BUILT_IN_PRESETS[name];
	}
	const available = listAvailablePresets(customPresets);
	throw new ConfigurationError(
		"preset",
		`Unknown preset "${name}". Available presets: ${available.join(", ")}`,
	);
}

/** Check whether a preset name is valid (built-in or custom). */
export function isValidPresetName(
	name: string,
	customPresets?: Record<string, ToolRemovalPreset>,
): boolean {
	return !!(customPresets?.[name] || BUILT_IN_PRESETS[name]);
}

/** List all available preset names (built-in + custom). */
export function listAvailablePresets(
	customPresets?: Record<string, ToolRemovalPreset>,
): string[] {
	const names = new Set(Object.keys(BUILT_IN_PRESETS));
	if (customPresets) {
		for (const key of Object.keys(customPresets)) {
			names.add(key);
		}
	}
	return [...names];
}
