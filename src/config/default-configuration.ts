/**
 * Default Configuration
 *
 * Built-in defaults and environment variable mapping for CxsConfiguration.
 */

import { homedir } from "node:os";
import { join } from "pathe";
import { DEFAULT_EVENT_PRESERVE_LIST } from "../types/codex-session-types.js";
import type { CxsConfiguration } from "../types/configuration-types.js";
import { DEFAULT_TRUNCATE_LENGTH } from "./tool-removal-presets.js";

/** Built-in default configuration. */
export const DEFAULT_CONFIGURATION: CxsConfiguration = {
	codexDir: join(homedir(), ".codex"),
	defaultPreset: "default",
	customPresets: {},
	eventPreserveList: [...DEFAULT_EVENT_PRESERVE_LIST],
	truncateLength: DEFAULT_TRUNCATE_LENGTH,
};

/** Environment variable name -> CxsConfiguration field name mapping. */
export const ENV_VAR_MAP: Record<string, keyof CxsConfiguration> = {
	CXS_CLONER_CODEX_DIR: "codexDir",
};

/** Read configuration overrides from environment variables. */
export function readEnvironmentOverrides(): Partial<CxsConfiguration> {
	const overrides: Partial<CxsConfiguration> = {};

	for (const [envVar, field] of Object.entries(ENV_VAR_MAP)) {
		const value = process.env[envVar];
		if (value !== undefined) {
			// All current env var mappings are string fields
			(overrides as Record<string, unknown>)[field] = value;
		}
	}

	return overrides;
}
