import { resolve } from "pathe";
import type { RolloutLine } from "../../src/types/codex-session-types.js";

export { SessionBuilder } from "./builders/session-builder.js";

/** Resolve a path relative to the fixtures data directory. */
export function fixtureDataPath(filename: string): string {
	return resolve(__dirname, "data", filename);
}

/** Resolve a path relative to the reduced smoke fixtures directory. */
export function smokeFixtureDataPath(filename: string): string {
	return fixtureDataPath(`smoke/${filename}`);
}

/** Read a JSONL fixture file and parse each line into a RolloutLine. */
export async function readFixtureSession(
	filename: string,
): Promise<RolloutLine[]> {
	const filePath = fixtureDataPath(filename);
	const content = await Bun.file(filePath).text();
	return content
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line, index) => {
			try {
				return JSON.parse(line) as RolloutLine;
			} catch (error) {
				throw new Error(
					`Malformed JSON in fixture "${filename}" at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		});
}

/** Read a reduced smoke fixture session. */
export async function readSmokeFixtureSession(
	filename: string,
): Promise<RolloutLine[]> {
	return readFixtureSession(`smoke/${filename}`);
}
