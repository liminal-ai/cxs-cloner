import { ArgumentValidationError } from "../errors/clone-operation-errors.js";

/**
 * Flags that accept both bare (boolean-like) and valued (string) forms.
 * node:util.parseArgs treats bare `--flag` as boolean true for string-typed options,
 * and consumes the next arg as the value — breaking `--strip-tools --strip-reasoning=none`.
 * We normalize bare flags to `--flag=true` so parseArgs sees an explicit string value.
 */
const BOOLEAN_STRING_FLAGS = ["--strip-tools", "--strip-reasoning"] as const;

/**
 * Pre-process argv for citty boolean/string flag handling.
 *
 * Fixes: bare `--strip-tools` (no value) is mis-parsed by node:util.parseArgs
 * as boolean `true` (type mismatch) or it consumes the next flag as its value.
 * This rewrites bare flags to `--flag=true` so parseArgs gets an explicit string.
 */
export function normalizeArgs(argv: string[]): string[] {
	const result: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		// Check if this arg is a bare boolean/string flag (no `=`)
		const matchedFlag = BOOLEAN_STRING_FLAGS.find(
			(flag) => arg === flag && !arg.includes("="),
		);

		if (matchedFlag) {
			const nextArg = argv[i + 1];
			// If next arg is missing or is another flag, this is a bare flag
			if (nextArg === undefined || nextArg.startsWith("-")) {
				result.push(`${matchedFlag}=true`);
			} else {
				// Next arg is a value (e.g., `--strip-tools aggressive`) — keep as-is
				result.push(arg);
			}
		} else {
			result.push(arg);
		}
	}

	return result;
}

/**
 * Validate that at least one stripping flag is present for the clone subcommand.
 * Throws ArgumentValidationError if neither --strip-tools nor --strip-reasoning is provided.
 */
export function validateStrippingFlags(
	hasStripTools: boolean,
	hasStripReasoning: boolean,
): void {
	if (!hasStripTools && !hasStripReasoning) {
		throw new ArgumentValidationError(
			"stripping flags",
			"At least one stripping flag is required. Use --strip-tools, --strip-reasoning, or both.",
		);
	}
}
