import { describe, expect, test } from "bun:test";
import {
	normalizeArgs,
	validateStrippingFlags,
} from "../../src/cli/normalize-args.js";
import { ArgumentValidationError } from "../../src/errors/clone-operation-errors.js";

describe("validateStrippingFlags", () => {
	// TC-6.1.0: no stripping flags → error
	test("TC-6.1.0: no stripping flags returns error", () => {
		expect(() => validateStrippingFlags(false, false)).toThrow(
			ArgumentValidationError,
		);
		expect(() => validateStrippingFlags(false, false)).toThrow(
			"At least one stripping flag is required",
		);
	});

	test("--strip-tools present → no error", () => {
		expect(() => validateStrippingFlags(true, false)).not.toThrow();
	});

	test("--strip-reasoning present → no error", () => {
		expect(() => validateStrippingFlags(false, true)).not.toThrow();
	});

	test("both flags present → no error", () => {
		expect(() => validateStrippingFlags(true, true)).not.toThrow();
	});
});

describe("normalizeArgs", () => {
	test("bare --strip-tools is rewritten to --strip-tools=true", () => {
		const result = normalizeArgs(["clone", "abc", "--strip-tools"]);
		expect(result).toEqual(["clone", "abc", "--strip-tools=true"]);
	});

	test("bare --strip-reasoning is rewritten to --strip-reasoning=true", () => {
		const result = normalizeArgs(["clone", "abc", "--strip-reasoning"]);
		expect(result).toEqual(["clone", "abc", "--strip-reasoning=true"]);
	});

	test("--strip-tools followed by another flag does not consume it", () => {
		const result = normalizeArgs([
			"clone",
			"abc",
			"--strip-tools",
			"--strip-reasoning=none",
		]);
		expect(result).toEqual([
			"clone",
			"abc",
			"--strip-tools=true",
			"--strip-reasoning=none",
		]);
	});

	test("--strip-tools with explicit value is unchanged", () => {
		const result = normalizeArgs(["clone", "abc", "--strip-tools=aggressive"]);
		expect(result).toEqual(["clone", "abc", "--strip-tools=aggressive"]);
	});

	test("--strip-tools with space-separated value is unchanged", () => {
		const result = normalizeArgs([
			"clone",
			"abc",
			"--strip-tools",
			"aggressive",
		]);
		expect(result).toEqual(["clone", "abc", "--strip-tools", "aggressive"]);
	});

	test("--strip-tools followed by --force does not consume it", () => {
		const result = normalizeArgs(["clone", "abc", "--strip-tools", "--force"]);
		expect(result).toEqual(["clone", "abc", "--strip-tools=true", "--force"]);
	});

	test("unrelated args pass through unchanged", () => {
		const result = normalizeArgs([
			"list",
			"--limit",
			"10",
			"--codex-dir",
			"/tmp",
		]);
		expect(result).toEqual(["list", "--limit", "10", "--codex-dir", "/tmp"]);
	});
});
