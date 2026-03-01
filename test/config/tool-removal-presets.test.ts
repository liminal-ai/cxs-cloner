import { describe, expect, it } from "bun:test";
import {
	isValidPresetName,
	listAvailablePresets,
	resolvePreset,
} from "../../src/config/tool-removal-presets.js";
import { ConfigurationError } from "../../src/errors/clone-operation-errors.js";

describe("tool-removal-presets", () => {
	describe("resolvePreset", () => {
		it("TC-5.4.1: no preset value resolves to default", () => {
			const result = resolvePreset("default");
			expect(result).toEqual({ keepTurnsWithTools: 20, truncatePercent: 50 });
		});

		it("TC-5.4.2: extreme preset → keep=0", () => {
			const result = resolvePreset("extreme");
			expect(result).toEqual({ keepTurnsWithTools: 0, truncatePercent: 0 });
		});

		it("TC-5.4.3: heavy preset → keep=10, truncate=80%", () => {
			const result = resolvePreset("heavy");
			expect(result).toEqual({ keepTurnsWithTools: 10, truncatePercent: 80 });
		});

		it("TC-9.2.1: custom preset applied when named", () => {
			const customPresets = {
				light: { keepTurnsWithTools: 30, truncatePercent: 30 },
			};
			const result = resolvePreset("light", customPresets);
			expect(result).toEqual({ keepTurnsWithTools: 30, truncatePercent: 30 });
		});

		it("TC-9.2.2: custom presets checked first, then built-in", () => {
			// Custom preset overrides built-in name
			const customPresets = {
				default: { keepTurnsWithTools: 99, truncatePercent: 10 },
			};
			const result = resolvePreset("default", customPresets);
			expect(result).toEqual({ keepTurnsWithTools: 99, truncatePercent: 10 });
		});

		it("throws ConfigurationError for unknown preset", () => {
			expect(() => resolvePreset("nonexistent")).toThrow(ConfigurationError);
			expect(() => resolvePreset("nonexistent")).toThrow(/available presets/i);
		});
	});

	describe("isValidPresetName", () => {
		it("returns true for built-in presets", () => {
			expect(isValidPresetName("default")).toBe(true);
			expect(isValidPresetName("aggressive")).toBe(true);
			expect(isValidPresetName("heavy")).toBe(true);
			expect(isValidPresetName("extreme")).toBe(true);
		});

		it("returns false for unknown names", () => {
			expect(isValidPresetName("nonexistent")).toBe(false);
		});

		it("returns true for custom presets", () => {
			const custom = { light: { keepTurnsWithTools: 30, truncatePercent: 30 } };
			expect(isValidPresetName("light", custom)).toBe(true);
		});
	});

	describe("listAvailablePresets", () => {
		it("lists built-in presets", () => {
			const names = listAvailablePresets();
			expect(names).toContain("default");
			expect(names).toContain("aggressive");
			expect(names).toContain("heavy");
			expect(names).toContain("extreme");
		});

		it("includes custom presets in the list", () => {
			const custom = { light: { keepTurnsWithTools: 30, truncatePercent: 30 } };
			const names = listAvailablePresets(custom);
			expect(names).toContain("light");
			expect(names).toContain("default");
		});
	});
});
