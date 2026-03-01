/**
 * Configuration Loader
 *
 * Load configuration from all layers using c12.
 * Precedence: defaults -> config file -> env vars -> CLI flags (CLI flags applied by caller).
 */

import { loadConfig } from "c12";
import { ConfigurationError } from "../errors/clone-operation-errors.js";
import type { CxsConfiguration } from "../types/configuration-types.js";
import {
	cxsConfigurationPartialSchema,
	cxsConfigurationSchema,
} from "./configuration-schema.js";
import {
	DEFAULT_CONFIGURATION,
	readEnvironmentOverrides,
} from "./default-configuration.js";

/** Options for controlling configuration loading behavior. */
export interface LoadConfigurationOptions {
	/** Working directory for config file search (defaults to process.cwd()). */
	cwd?: string;
}

/**
 * Load configuration from all layers.
 * Precedence: defaults -> config file -> env vars -> CLI overrides.
 *
 * @param overrides - CLI flag overrides to merge on top
 * @param options - Options controlling config file search
 * @returns Validated CxsConfiguration
 * @throws ConfigurationError if config file has invalid schema
 */
export async function loadConfiguration(
	overrides?: Partial<CxsConfiguration>,
	options?: LoadConfigurationOptions,
): Promise<CxsConfiguration> {
	// Layer 1: Start with built-in defaults
	let config: CxsConfiguration = { ...DEFAULT_CONFIGURATION };

	// Layer 2: Load config file via c12
	const fileConfig = await loadConfigFile(options?.cwd);
	if (fileConfig) {
		config = mergePartial(config, fileConfig);
	}

	// Layer 3: Apply environment variable overrides
	const envOverrides = readEnvironmentOverrides();
	config = mergePartial(config, envOverrides);

	// Layer 4: Apply CLI overrides
	if (overrides) {
		config = mergePartial(config, overrides);
	}

	// Final validation
	const result = cxsConfigurationSchema.safeParse(config);
	if (!result.success) {
		throw new ConfigurationError(
			"config",
			result.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; "),
		);
	}

	return result.data;
}

/**
 * Load and validate config file content via c12.
 *
 * c12 searches for: cxs-cloner.config.ts, .cxs-clonerrc, .cxs-clonerrc.json, etc.
 *
 * @returns Partial configuration from file, or null if no file found
 * @throws ConfigurationError if file has invalid schema
 */
async function loadConfigFile(
	cwd?: string,
): Promise<Partial<CxsConfiguration> | null> {
	try {
		const { config: rawConfig } = await loadConfig({
			name: "cxs-cloner",
			defaults: {},
			cwd,
		});

		// If no config was loaded (empty or falsy), return null
		if (!rawConfig || Object.keys(rawConfig).length === 0) {
			return null;
		}

		// Validate the partial config with zod
		const parsed = cxsConfigurationPartialSchema.safeParse(rawConfig);
		if (!parsed.success) {
			throw new ConfigurationError(
				"config",
				parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; "),
			);
		}

		return parsed.data as Partial<CxsConfiguration>;
	} catch (error) {
		// Re-throw our own errors
		if (error instanceof ConfigurationError) {
			throw error;
		}
		// Only swallow file-not-found errors silently (per spec: "Config file not found → Use defaults silently")
		if (isFileNotFoundError(error)) {
			return null;
		}
		// All other errors (syntax errors, permission issues, etc.) surface as ConfigurationError
		throw new ConfigurationError(
			"config",
			`Failed to load config file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Check if an error is a file-not-found error (ENOENT or MODULE_NOT_FOUND). */
function isFileNotFoundError(error: unknown): boolean {
	if (error instanceof Error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT" || nodeError.code === "MODULE_NOT_FOUND") {
			return true;
		}
	}
	return false;
}

/** Merge partial overrides onto a full config, only applying defined fields. */
function mergePartial(
	base: CxsConfiguration,
	partial: Partial<CxsConfiguration>,
): CxsConfiguration {
	const result = { ...base };

	for (const [key, value] of Object.entries(partial)) {
		if (value !== undefined) {
			(result as Record<string, unknown>)[key] = value;
		}
	}

	return result;
}
