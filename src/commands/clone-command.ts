import { defineCommand } from "citty";
import { validateStrippingFlags } from "../cli/normalize-args.js";
import { loadConfiguration } from "../config/configuration-loader.js";
import { resolvePreset } from "../config/tool-removal-presets.js";
import { executeCloneOperation } from "../core/clone-operation-executor.js";
import {
	ArgumentValidationError,
	CxsError,
} from "../errors/clone-operation-errors.js";
import { formatCloneResult } from "../output/clone-result-formatter.js";
import type { ResolvedCloneConfig } from "../types/clone-operation-types.js";
import { DEFAULT_EVENT_PRESERVE_LIST } from "../types/codex-session-types.js";
import type { CxsConfiguration } from "../types/configuration-types.js";
import type {
	ReasoningMode,
	StripConfig,
} from "../types/tool-removal-types.js";

const VALID_REASONING_MODES = ["full", "summary-only", "none"] as const;

export const cloneCommand = defineCommand({
	meta: {
		name: "clone",
		description: "Clone a Codex session with configurable stripping",
	},
	args: {
		sessionId: {
			type: "positional",
			description: "Session ID (full or partial UUID)",
			required: true,
		},
		"strip-tools": {
			type: "string",
			description:
				"Strip tool call records using preset (default, aggressive, heavy, extreme)",
			required: false,
		},
		"strip-reasoning": {
			type: "string",
			description: "Strip reasoning records (full, summary-only, none)",
			required: false,
		},
		output: {
			type: "string",
			alias: "o",
			description: "Custom output path (default: Codex sessions directory)",
			required: false,
		},
		force: {
			type: "boolean",
			description: "Skip malformed JSON lines instead of aborting",
			default: false,
		},
		json: {
			type: "boolean",
			description: "Output statistics as JSON",
			default: false,
		},
		verbose: {
			type: "boolean",
			alias: "v",
			description: "Show detailed removal statistics",
			default: false,
		},
		"codex-dir": {
			type: "string",
			description: "Override default Codex directory (~/.codex)",
			required: false,
		},
	},
	async run({ args }) {
		try {
			// Validate at least one stripping flag present
			const hasStripTools = args["strip-tools"] !== undefined;
			const hasStripReasoning = args["strip-reasoning"] !== undefined;
			validateStrippingFlags(hasStripTools, hasStripReasoning);

			// Load layered configuration: defaults → config file → env vars
			// Then merge CLI flags on top as overrides
			const cxsConfig = await loadConfiguration(
				args["codex-dir"] ? { codexDir: args["codex-dir"] } : undefined,
			);

			// Build StripConfig using loaded configuration
			const stripConfig = buildStripConfig(
				cxsConfig,
				hasStripTools,
				args["strip-tools"],
				hasStripReasoning,
				args["strip-reasoning"],
			);

			const config: ResolvedCloneConfig = {
				sessionId: args.sessionId,
				codexDir: cxsConfig.codexDir,
				outputPath: args.output ?? null,
				stripConfig,
				force: args.force ?? false,
				jsonOutput: args.json ?? false,
				verbose: args.verbose ?? false,
			};

			const result = await executeCloneOperation(config);
			const output = formatCloneResult(result, {
				json: config.jsonOutput,
				verbose: config.verbose,
			});
			console.log(output);
		} catch (error) {
			if (error instanceof CxsError) {
				console.error(`Error: ${error.message}`);
				process.exit(1);
			}
			throw error;
		}
	},
});

/**
 * Build StripConfig from CLI flag values and loaded configuration.
 * Uses configuration for defaults (preset name, custom presets, event preserve list, truncate length).
 */
export function buildStripConfig(
	cxsConfig: CxsConfiguration,
	hasStripTools: boolean,
	stripToolsValue: string | undefined,
	hasStripReasoning: boolean,
	stripReasoningValue: string | undefined,
): StripConfig {
	// Resolve tool preset using config's default preset and custom presets
	let toolPreset = null;
	if (hasStripTools) {
		const presetName =
			stripToolsValue && stripToolsValue !== "true"
				? stripToolsValue
				: cxsConfig.defaultPreset;
		toolPreset = resolvePreset(presetName, cxsConfig.customPresets);
	}

	// Resolve reasoning mode
	let reasoningMode: ReasoningMode;
	if (hasStripReasoning) {
		const value = stripReasoningValue;
		if (value === "full" || value === "summary-only" || value === "none") {
			reasoningMode = value;
		} else if (value === undefined || value === "true") {
			reasoningMode = "full";
		} else {
			throw new ArgumentValidationError(
				"--strip-reasoning",
				`Invalid value "${value}". Valid values: ${VALID_REASONING_MODES.join(", ")}.`,
			);
		}
	} else if (hasStripTools) {
		// --strip-tools without --strip-reasoning → implicit full
		reasoningMode = "full";
	} else {
		reasoningMode = "none";
	}

	// Merge config's eventPreserveList with built-in defaults (union, deduplicated)
	const mergedPreserveList = [
		...new Set([
			...DEFAULT_EVENT_PRESERVE_LIST,
			...cxsConfig.eventPreserveList,
		]),
	];

	return {
		toolPreset,
		reasoningMode,
		stripTools: hasStripTools,
		eventPreserveList: mergedPreserveList,
		truncateLength: cxsConfig.truncateLength,
	};
}
