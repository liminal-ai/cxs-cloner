/**
 * Configuration Schema
 *
 * Zod schema for validating CxsConfiguration.
 * Validates all fields with appropriate constraints.
 */

import { z } from "zod";

/** Zod schema for a tool removal preset. */
export const toolRemovalPresetSchema = z.object({
	keepTurnsWithTools: z.number().min(0),
	truncatePercent: z.number().min(0).max(100),
});

/**
 * Full Zod schema for CxsConfiguration.
 * All fields required — used for validating the final merged config.
 */
export const cxsConfigurationSchema = z.object({
	codexDir: z.string(),
	defaultPreset: z.string(),
	customPresets: z.record(z.string(), toolRemovalPresetSchema),
	eventPreserveList: z.array(z.string()),
	truncateLength: z.number().min(0),
});

/**
 * Partial schema for config file content.
 * All fields optional, unknown fields stripped.
 */
export const cxsConfigurationPartialSchema = cxsConfigurationSchema
	.partial()
	.passthrough();
