import { resolve } from "pathe";
import type { RolloutLine } from "../../src/types/codex-session-types.js";

export { SessionBuilder } from "./builders/session-builder.js";

/** Resolve a path relative to the fixtures data directory. */
export function fixtureDataPath(filename: string): string {
	return resolve(__dirname, "data", filename);
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
		.map((line) => JSON.parse(line) as RolloutLine);
}
