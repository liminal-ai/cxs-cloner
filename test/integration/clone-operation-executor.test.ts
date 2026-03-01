import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import consola from "consola";
import { join } from "pathe";
import { DEFAULT_TRUNCATE_LENGTH } from "../../src/config/tool-removal-presets.js";
import { executeCloneOperation } from "../../src/core/clone-operation-executor.js";
import type { ResolvedCloneConfig } from "../../src/types/clone-operation-types.js";
import type {
	RolloutLine,
	SessionMetaPayload,
} from "../../src/types/codex-session-types.js";
import { DEFAULT_EVENT_PRESERVE_LIST } from "../../src/types/codex-session-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cxs-executor-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs) {
		try {
			await rm(dir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}
	tempDirs = [];
});

/** Write a session to a properly named file in a temp codex dir structure. */
async function writeTestSession(
	codexDir: string,
	threadId: string,
	records: RolloutLine[],
): Promise<string> {
	const now = new Date();
	const year = now.getFullYear().toString();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	const seconds = now.getSeconds().toString().padStart(2, "0");

	const dateDir = join(codexDir, "sessions", year, month, day);
	await mkdir(dateDir, { recursive: true });

	const timestamp = `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
	const fileName = `rollout-${timestamp}-${threadId}.jsonl`;
	const filePath = join(dateDir, fileName);

	const content = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
	await writeFile(filePath, content, "utf-8");

	return filePath;
}

/** Build a standard config for tests. */
function buildConfig(
	codexDir: string,
	threadId: string,
	overrides?: Partial<ResolvedCloneConfig>,
): ResolvedCloneConfig {
	return {
		sessionId: threadId,
		codexDir,
		outputPath: null,
		stripConfig: {
			toolPreset: { keepTurnsWithTools: 20, truncatePercent: 50 },
			reasoningMode: "full",
			stripTools: true,
			eventPreserveList: DEFAULT_EVENT_PRESERVE_LIST,
			truncateLength: DEFAULT_TRUNCATE_LENGTH,
		},
		force: false,
		jsonOutput: false,
		verbose: false,
		...overrides,
	};
}

/** Parse a JSONL output file into records. */
async function readOutputRecords(filePath: string): Promise<RolloutLine[]> {
	const content = await readFile(filePath, "utf-8");
	return content
		.split("\n")
		.filter((l) => l.trim() !== "")
		.map((l) => JSON.parse(l) as RolloutLine);
}

/** Find session_meta record in a record array. */
function findSessionMeta(
	records: RolloutLine[],
): SessionMetaPayload | undefined {
	for (const record of records) {
		if (record.type === "session_meta") {
			return record.payload as SessionMetaPayload;
		}
	}
	return undefined;
}

describe("executeCloneOperation", () => {
	// TC-8.1.1: clone gets new UUID
	test("TC-8.1.1: clone gets new UUID that differs from source", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-1111-2222-3333-444444444444";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 2 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.clonedThreadId).not.toBe(sourceThreadId);
		expect(result.clonedThreadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	// TC-8.1.2: session_meta has new thread ID
	test("TC-8.1.2: session_meta in output contains new thread ID", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-aaaa-bbbb-cccc-dddddddddddd";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta).toBeDefined();
		expect(meta!.id).toBe(result.clonedThreadId);
	});

	// TC-8.3.2: custom path warns no resume
	test("TC-8.3.2: custom output path sets resumable to false", async () => {
		const codexDir = await createTempDir();
		const outputDir = await createTempDir();
		const sourceThreadId = "source-eeee-ffff-0000-111111111111";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const customOutput = join(outputDir, "custom-clone.jsonl");
		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId, { outputPath: customOutput }),
		);

		expect(result.resumable).toBe(false);
		expect(result.clonedSessionFilePath).toBe(customOutput);
	});

	// TC-8.3.3: every output line is valid JSON
	test("TC-8.3.3: every output line is valid JSON", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-2222-3333-4444-555555555555";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 3 })
			.addTurn({ functionCalls: 2, reasoning: true })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const content = await readFile(result.clonedSessionFilePath, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim() !== "");

		for (let i = 0; i < lines.length; i++) {
			expect(() => JSON.parse(lines[i])).not.toThrow();
		}
	});

	// TC-8.4.1: session_meta payload.id matches new UUID
	test("TC-8.4.1: session_meta payload.id matches clonedThreadId", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-6666-7777-8888-999999999999";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.id).toBe(result.clonedThreadId);
	});

	// TC-8.4.2: session_meta preserves original cwd, git, model_provider
	test("TC-8.4.2: session_meta preserves original fields", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-preserve-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({
				id: sourceThreadId,
				cwd: "/home/user/my-project",
				model_provider: "openai",
				git: {
					commit_hash: "abc123def",
					branch: "feature/test",
					origin_url: "https://github.com/user/repo.git",
				},
			})
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.cwd).toBe("/home/user/my-project");
		expect(meta!.model_provider).toBe("openai");
		expect(meta!.git?.commit_hash).toBe("abc123def");
		expect(meta!.git?.branch).toBe("feature/test");
		expect(meta!.git?.origin_url).toBe("https://github.com/user/repo.git");
	});

	// TC-8.4.3: session_meta sets forked_from_id to source ID
	test("TC-8.4.3: session_meta sets forked_from_id", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-fork-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const outputRecords = await readOutputRecords(result.clonedSessionFilePath);
		const meta = findSessionMeta(outputRecords);

		expect(meta!.forked_from_id).toBe(sourceThreadId);
	});

	// TC-8.5.1: statistics include all required counts
	test("TC-8.5.1: statistics include all required fields", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-stats-test-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({
				functionCalls: 2,
				reasoning: true,
				events: ["token_count", "user_message"],
			})
			.addTurn({ functionCalls: 1 })
			.addTurn({ functionCalls: 1, reasoning: true })
			.build();
		records.splice(records.length - 1, 0, {
			timestamp: "2025-01-15T10:00:40.000Z",
			type: "response_item",
			payload: {
				type: "ghost_snapshot",
				ghost_commit: { hash: "abc123" },
			},
		});

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		const stats = result.statistics;

		// All fields should be defined numbers
		expect(typeof stats.turnCountOriginal).toBe("number");
		expect(typeof stats.turnCountOutput).toBe("number");
		expect(typeof stats.functionCallsRemoved).toBe("number");
		expect(typeof stats.functionCallsTruncated).toBe("number");
		expect(typeof stats.reasoningBlocksRemoved).toBe("number");
		expect(typeof stats.eventMessagesRemoved).toBe("number");
		expect(typeof stats.turnContextRecordsRemoved).toBe("number");
		expect(typeof stats.ghostSnapshotsRemoved).toBe("number");
		expect(typeof stats.compactionDetected).toBe("boolean");
		expect(typeof stats.compactedRecordCount).toBe("number");
		expect(typeof stats.originalSizeBytes).toBe("number");
		expect(typeof stats.outputSizeBytes).toBe("number");
		expect(typeof stats.fileSizeReductionPercent).toBe("number");

		// Sanity checks
		expect(stats.originalSizeBytes).toBeGreaterThan(0);
		expect(stats.outputSizeBytes).toBeGreaterThan(0);
		expect(stats.outputSizeBytes).toBeLessThan(stats.originalSizeBytes);
		expect(stats.turnCountOriginal).toBe(3);
		expect(stats.reasoningBlocksRemoved).toBe(2);
		expect(stats.eventMessagesRemoved).toBeGreaterThan(0);
		expect(stats.ghostSnapshotsRemoved).toBeGreaterThan(0);
	});

	// TC-10.2.1: compaction detected in statistics
	test("TC-10.2.1: compaction detected in statistics", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-compaction-test-0000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.addCompactedRecord()
			.addTurn({ functionCalls: 2 })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.statistics.compactionDetected).toBe(true);
		expect(result.statistics.compactedRecordCount).toBeGreaterThan(0);
	});

	test("TC-10.2.1: compaction detected for response_item compaction only", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-compaction-item-only-0000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();
		records.push({
			timestamp: "2025-01-15T10:00:50.000Z",
			type: "response_item",
			payload: {
				type: "compaction",
				encrypted_content: "enc_data",
			},
		});

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.statistics.compactionDetected).toBe(true);
		expect(result.statistics.compactedRecordCount).toBe(1);
	});

	// Non-TC: Clone of session with zero tool calls
	test("clone of session with zero tool calls proceeds", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-no-tools-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ reasoning: true })
			.addTurn({ reasoning: true })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const warnings: string[] = [];
		const originalWarn = consola.warn;
		(consola as { warn: (...args: unknown[]) => void }).warn = (
			...args: unknown[]
		) => {
			warnings.push(args.map((arg) => String(arg)).join(" "));
		};

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		(consola as { warn: (...args: unknown[]) => void }).warn = originalWarn;

		expect(result.operationSucceeded).toBe(true);
		// Reasoning should still be stripped
		expect(result.statistics.reasoningBlocksRemoved).toBe(2);
		expect(
			warnings.some((warning) => warning.includes("Session has no tool calls")),
		).toBe(true);
	});

	// Non-TC: Clone of minimal session (just session_meta + one message)
	test("clone of minimal session succeeds", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-minimal-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn()
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		const result = await executeCloneOperation(
			buildConfig(codexDir, sourceThreadId),
		);

		expect(result.operationSucceeded).toBe(true);
		expect(result.clonedThreadId).toBeDefined();
	});

	// Non-TC: Concurrent clone operations (UUID uniqueness)
	test("concurrent clone operations produce unique thread IDs", async () => {
		const codexDir = await createTempDir();
		const sourceThreadId = "source-concurrent-000000000000";
		const records = new SessionBuilder()
			.addSessionMeta({ id: sourceThreadId })
			.addTurn({ functionCalls: 1 })
			.build();

		await writeTestSession(codexDir, sourceThreadId, records);

		// Run two clones concurrently, both to custom output to avoid path collision
		const outputDir = await createTempDir();
		const config1 = buildConfig(codexDir, sourceThreadId, {
			outputPath: join(outputDir, "clone1.jsonl"),
		});
		const config2 = buildConfig(codexDir, sourceThreadId, {
			outputPath: join(outputDir, "clone2.jsonl"),
		});

		const [result1, result2] = await Promise.all([
			executeCloneOperation(config1),
			executeCloneOperation(config2),
		]);

		expect(result1.clonedThreadId).not.toBe(result2.clonedThreadId);
	});
});
