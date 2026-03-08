import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { BUILT_IN_PRESETS } from "../../src/config/tool-removal-presets.js";
import { executeCloneOperation } from "../../src/core/clone-operation-executor.js";
import { scanSessionDirectory } from "../../src/io/session-directory-scanner.js";
import { readSessionMetadata } from "../../src/io/session-file-reader.js";
import type { ResolvedCloneConfig } from "../../src/types/clone-operation-types.js";
import type { RolloutLine } from "../../src/types/codex-session-types.js";
import { NATIVE_LIMITED_EVENT_PRESERVE_LIST } from "../../src/types/codex-session-types.js";
import { readSmokeFixtureSession } from "../fixtures/index.js";

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cxs-smoke-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

async function writeTestSession(
	codexDir: string,
	threadId: string,
	records: RolloutLine[],
): Promise<string> {
	const dateDir = join(codexDir, "sessions", "2026", "03", "05");
	await mkdir(dateDir, { recursive: true });
	const filePath = join(
		dateDir,
		`rollout-2026-03-05T12-00-00-${threadId}.jsonl`,
	);
	await writeFile(
		filePath,
		records.map((record) => JSON.stringify(record)).join("\n") + "\n",
		"utf-8",
	);
	return filePath;
}

async function writeSessionIndexEntry(
	codexDir: string,
	threadId: string,
	threadName: string,
): Promise<void> {
	await writeFile(
		join(codexDir, "session_index.jsonl"),
		JSON.stringify({
			id: threadId,
			thread_name: threadName,
			updated_at: "2026-03-05T12:00:00.000Z",
		}) + "\n",
		"utf-8",
	);
}

function buildConfig(
	codexDir: string,
	threadId: string,
	overrides?: Partial<ResolvedCloneConfig>,
): ResolvedCloneConfig {
	return {
		sessionId: threadId,
		codexDir,
		outputPath: null,
		targetCwd: null,
		stripConfig: {
			toolPreset: BUILT_IN_PRESETS.default,
			reasoningMode: "full",
			stripTools: true,
			eventPreserveList: NATIVE_LIMITED_EVENT_PRESERVE_LIST,
			truncateLength: 120,
		},
		force: false,
		jsonOutput: false,
		verbose: false,
		...overrides,
	};
}

async function readOutputRecords(filePath: string): Promise<RolloutLine[]> {
	const content = await readFile(filePath, "utf-8");
	return content
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as RolloutLine);
}

function countEvents(records: RolloutLine[], type: string): number {
	return records.filter(
		(record) =>
			record.type === "event_msg" &&
			(record.payload as { type?: string }).type === type,
	).length;
}

function countSubtype(records: RolloutLine[], type: string): number {
	return records.filter(
		(record) =>
			record.type === "response_item" &&
			(record.payload as { type?: string }).type === type,
	).length;
}

describe("clone smoke fixtures", () => {
	test("default clone of build fixture stays discoverable and keeps assistant replay history", async () => {
		const codexDir = await createTempDir();
		const records = await readSmokeFixtureSession("build-session.jsonl");
		const sourceThreadId = "smoke-build-source-000000000000";

		await writeTestSession(codexDir, sourceThreadId, records);
		await writeSessionIndexEntry(
			codexDir,
			sourceThreadId,
			"Smoke build session",
		);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const scanned = await scanSessionDirectory(codexDir);
		const clonedSession = scanned.find(
			(session) => session.threadId === result.clonedThreadId,
		);

		expect(result.cloneThreadName).toBe("Smoke build session (Clone)");
		expect(result.sessionIndexUpdated).toBe(true);
		expect(countEvents(outputRecords, "agent_message")).toBeGreaterThan(0);
		expect(countEvents(outputRecords, "user_message")).toBeGreaterThan(0);
		expect(clonedSession).toBeDefined();

		const metadata = await readSessionMetadata(clonedSession!.filePath);
		expect(metadata.threadId).toBe(result.clonedThreadId);
		expect(metadata.firstUserMessage).toContain("Implement build step 0");
	});

	test("aggressive and heavy presets reduce tool content but preserve replay events", async () => {
		const codexDir = await createTempDir();
		const records = await readSmokeFixtureSession("build-session.jsonl");
		const sourceThreadId = "smoke-build-source-000000000000";

		await writeTestSession(codexDir, sourceThreadId, records);

		const aggressiveResult = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, {
				outputPath: join(codexDir, "aggressive.jsonl"),
				stripConfig: {
					toolPreset: BUILT_IN_PRESETS.aggressive,
					reasoningMode: "full",
					stripTools: true,
					eventPreserveList: NATIVE_LIMITED_EVENT_PRESERVE_LIST,
					truncateLength: 120,
				},
			}),
		);
		const heavyResult = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, {
				outputPath: join(codexDir, "heavy.jsonl"),
				stripConfig: {
					toolPreset: BUILT_IN_PRESETS.heavy,
					reasoningMode: "full",
					stripTools: true,
					eventPreserveList: NATIVE_LIMITED_EVENT_PRESERVE_LIST,
					truncateLength: 120,
				},
			}),
		);

		const aggressiveRecords = await readOutputRecords(
			aggressiveResult.clonedSessionFilePath,
		);
		const heavyRecords = await readOutputRecords(
			heavyResult.clonedSessionFilePath,
		);

		expect(aggressiveResult.statistics.functionCallsRemoved).toBeGreaterThan(0);
		expect(aggressiveResult.statistics.functionCallsTruncated).toBeGreaterThan(
			0,
		);
		expect(heavyResult.statistics.functionCallsRemoved).toBeGreaterThan(0);
		expect(heavyResult.statistics.functionCallsTruncated).toBeGreaterThan(0);
		expect(countEvents(aggressiveRecords, "agent_message")).toBeGreaterThan(0);
		expect(countEvents(heavyRecords, "agent_message")).toBeGreaterThan(0);
		expect(countEvents(aggressiveRecords, "user_message")).toBeGreaterThan(0);
		expect(countEvents(heavyRecords, "user_message")).toBeGreaterThan(0);
		expect(countSubtype(aggressiveRecords, "function_call")).toBeLessThan(11);
		expect(countSubtype(heavyRecords, "function_call")).toBeLessThan(11);
	});

	test("assessment fixture derives a stable clone name from the first user message fallback", async () => {
		const codexDir = await createTempDir();
		const records = await readSmokeFixtureSession("assessment-session.jsonl");
		const sourceThreadId = "smoke-assessment-source-0000000000";

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const sessionIndex = await readFile(
			join(codexDir, "session_index.jsonl"),
			"utf-8",
		);
		const cloneEntry = sessionIndex
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, string>)
			.at(-1);

		expect(result.cloneThreadName).toBe(
			"Assess the build for real-world readiness. (Clone)",
		);
		expect(result.sessionIndexUpdated).toBe(true);
		expect(cloneEntry?.thread_name).toBe(
			"Assess the build for real-world readiness. (Clone)",
		);
	});

	test("improvement fixture synthesizes a replay-compatible user_message when only response items survive", async () => {
		const codexDir = await createTempDir();
		const records = await readSmokeFixtureSession("improvement-session.jsonl");
		const sourceThreadId = "smoke-improvement-source-000000000";

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);

		expect(countEvents(outputRecords, "user_message")).toBe(1);
		expect(countEvents(outputRecords, "agent_message")).toBe(1);
		expect(
			(
				outputRecords.find(
					(record) =>
						record.type === "event_msg" &&
						(record.payload as { type?: string }).type === "user_message",
				)?.payload as { message?: string }
			).message,
		).toBe("Apply the assessment fixes and re-run the tests.");
	});

	test("review-compaction fixture preserves replay markers through cloning", async () => {
		const codexDir = await createTempDir();
		const records = await readSmokeFixtureSession(
			"review-compaction-session.jsonl",
		);
		const sourceThreadId = "smoke-review-source-000000000000";

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);
		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);

		expect(result.statistics.compactionDetected).toBe(true);
		expect(countEvents(outputRecords, "context_compacted")).toBe(1);
		expect(countEvents(outputRecords, "turn_aborted")).toBe(1);
		expect(countEvents(outputRecords, "entered_review_mode")).toBe(1);
		expect(countEvents(outputRecords, "exited_review_mode")).toBe(1);
		expect(countEvents(outputRecords, "thread_rolled_back")).toBe(1);
		expect(countEvents(outputRecords, "undo_completed")).toBe(1);
		expect(countEvents(outputRecords, "item_completed")).toBe(1);
		expect(outputRecords.some((record) => record.type === "compacted")).toBe(
			true,
		);
	});
});
