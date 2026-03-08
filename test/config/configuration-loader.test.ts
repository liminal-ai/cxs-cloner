import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { buildStripConfig } from "../../src/commands/clone-command.js";
import { loadConfiguration } from "../../src/config/configuration-loader.js";
import { ConfigurationError } from "../../src/errors/clone-operation-errors.js";

describe("configuration-loader", () => {
	let testDir: string;
	let savedEnv: Record<string, string | undefined>;

	beforeEach(async () => {
		testDir = join(
			tmpdir(),
			`cxs-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(testDir, { recursive: true });

		// Save and clean env vars that could affect tests
		savedEnv = {
			CXS_CLONER_CODEX_DIR: process.env.CXS_CLONER_CODEX_DIR,
		};
		delete process.env.CXS_CLONER_CODEX_DIR;
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });

		// Restore env vars
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	it("TC-9.1.1: env var used when no CLI flag", async () => {
		process.env.CXS_CLONER_CODEX_DIR = "/custom/path";

		const config = await loadConfiguration(undefined, { cwd: testDir });

		expect(config.codexDir).toBe("/custom/path");
	});

	it("TC-9.1.2: CLI flag overrides env var", async () => {
		process.env.CXS_CLONER_CODEX_DIR = "/env/path";

		const config = await loadConfiguration(
			{ codexDir: "/cli/path" },
			{ cwd: testDir },
		);

		expect(config.codexDir).toBe("/cli/path");
	});

	it("invalid schema throws ConfigurationError with zod details", async () => {
		// Write a config file with an invalid value (truncateLength should be a number)
		await writeFile(
			join(testDir, "cxs-cloner.config.json"),
			JSON.stringify({ truncateLength: "not-a-number" }),
		);

		await expect(
			loadConfiguration(undefined, { cwd: testDir }),
		).rejects.toThrow(ConfigurationError);
	});

	it("missing config file uses defaults silently", async () => {
		// testDir is empty — no config file present
		const config = await loadConfiguration(undefined, { cwd: testDir });

		// Should have sensible defaults
		expect(config.codexDir).toContain(".codex");
		expect(config.defaultPreset).toBe("default");
		expect(config.customPresets).toEqual({});
		expect(config.eventPreserveList).toEqual([]);
		expect(config.truncateLength).toBe(120);
	});

	it("config file formats load correctly (.json)", async () => {
		await writeFile(
			join(testDir, "cxs-cloner.config.json"),
			JSON.stringify({ defaultPreset: "aggressive" }),
		);

		const config = await loadConfiguration(undefined, { cwd: testDir });

		expect(config.defaultPreset).toBe("aggressive");
		// Other fields should still have defaults
		expect(config.codexDir).toContain(".codex");
		expect(config.truncateLength).toBe(120);
	});

	it("config file formats load correctly (.ts)", async () => {
		await writeFile(
			join(testDir, "cxs-cloner.config.ts"),
			`export default { defaultPreset: "heavy" };\n`,
		);

		const config = await loadConfiguration(undefined, { cwd: testDir });

		expect(config.defaultPreset).toBe("heavy");
		// Other fields should still have defaults
		expect(config.codexDir).toContain(".codex");
		expect(config.truncateLength).toBe(120);
	});

	it("custom presets from config file available to resolvePreset", async () => {
		await writeFile(
			join(testDir, "cxs-cloner.config.json"),
			JSON.stringify({
				customPresets: {
					light: { keepTurnsWithTools: 30, truncatePercent: 30 },
				},
			}),
		);

		const config = await loadConfiguration(undefined, { cwd: testDir });

		expect(config.customPresets).toEqual({
			light: { keepTurnsWithTools: 30, truncatePercent: 30 },
		});

		// Verify the custom preset is usable by resolvePreset
		const { resolvePreset } = await import(
			"../../src/config/tool-removal-presets.js"
		);
		const resolved = resolvePreset("light", config.customPresets);
		expect(resolved).toEqual({ keepTurnsWithTools: 30, truncatePercent: 30 });
	});

	it("TC-9.2.2: config defaultPreset is applied when --strip-tools has no explicit value", async () => {
		await writeFile(
			join(testDir, "cxs-cloner.config.json"),
			JSON.stringify({ defaultPreset: "heavy" }),
		);

		const config = await loadConfiguration(undefined, { cwd: testDir });
		const stripConfig = buildStripConfig(
			config,
			true,
			undefined,
			false,
			undefined,
		);

		expect(stripConfig.toolPreset).toEqual({
			keepTurnsWithTools: 10,
			truncatePercent: 80,
		});
	});
});
