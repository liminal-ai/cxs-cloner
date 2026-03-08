import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { writeClonedSession } from "../../src/io/session-file-writer.js";
import type { RolloutLine } from "../../src/types/codex-session-types.js";
import { SessionBuilder } from "../fixtures/builders/session-builder.js";

/** Build a minimal session for writer tests. */
function buildMinimalSession(): RolloutLine[] {
	return new SessionBuilder()
		.addSessionMeta({ id: "test-thread-id" })
		.addTurn({ functionCalls: 1 })
		.build();
}

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cxs-writer-test-"));
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

describe("writeClonedSession", () => {
	// TC-8.2.1: default output path is correct date hierarchy
	test("TC-8.2.1: default output path uses date hierarchy", async () => {
		const codexDir = await createTempDir();
		const records = buildMinimalSession();
		const threadId = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
		const cloneTimestamp = new Date("2026-03-06T23:12:17.810Z");

		const result = await writeClonedSession(records, {
			outputPath: null,
			codexDir,
			threadId,
			cloneTimestamp,
		});

		expect(result.isDefaultLocation).toBe(true);

		// Path should contain sessions/YYYY/MM/DD/ and the threadId
		const year = cloneTimestamp.getFullYear().toString();
		const month = (cloneTimestamp.getMonth() + 1).toString().padStart(2, "0");
		const day = cloneTimestamp.getDate().toString().padStart(2, "0");

		expect(result.filePath).toContain(join("sessions", year, month, day));
		expect(result.filePath).toContain(`rollout-`);
		expect(result.filePath).toContain(threadId);
		expect(result.filePath).toEndWith(".jsonl");

		// File should exist and be non-empty
		const fileStat = await stat(result.filePath);
		expect(fileStat.size).toBeGreaterThan(0);
		expect(result.sizeBytes).toBe(fileStat.size);
	});

	// TC-8.2.2: custom output path honored
	test("TC-8.2.2: custom output path is honored", async () => {
		const tempDir = await createTempDir();
		const customPath = join(tempDir, "custom-output", "test.jsonl");
		const records = buildMinimalSession();

		const result = await writeClonedSession(records, {
			outputPath: customPath,
			codexDir: tempDir,
			threadId: "unused-for-custom",
			cloneTimestamp: new Date("2026-03-06T23:12:17.810Z"),
		});

		expect(result.isDefaultLocation).toBe(false);
		expect(result.filePath).toBe(customPath);

		// File should exist
		const fileStat = await stat(customPath);
		expect(fileStat.size).toBeGreaterThan(0);
		expect(result.sizeBytes).toBe(fileStat.size);
	});

	// TC-8.3.3: every output line is valid JSON (writer-level check)
	test("every output line is valid JSON", async () => {
		const tempDir = await createTempDir();
		const customPath = join(tempDir, "valid-json.jsonl");
		const records = buildMinimalSession();

		await writeClonedSession(records, {
			outputPath: customPath,
			codexDir: tempDir,
			threadId: "test-thread",
			cloneTimestamp: new Date("2026-03-06T23:12:17.810Z"),
		});

		const content = await readFile(customPath, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim() !== "");

		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
		expect(lines.length).toBe(records.length);
	});

	// Non-TC: Partial file cleanup on write failure
	test("cleans up temp file when rename fails", async () => {
		const records = buildMinimalSession();
		const tempDir = await createTempDir();
		const outputDir = join(tempDir, "output");
		await mkdir(outputDir, { recursive: true });

		// Create a DIRECTORY at the target file path.
		// writeFile to the temp path will succeed, but rename(file → directory) fails
		// with EISDIR, exercising the cleanup code that unlinks the temp file.
		const targetPath = join(outputDir, "clone.jsonl");
		await mkdir(targetPath);

		try {
			await writeClonedSession(records, {
				outputPath: targetPath,
				codexDir: tempDir,
				threadId: "test",
				cloneTimestamp: new Date("2026-03-06T23:12:17.810Z"),
			});
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect(error).toBeDefined();
		}

		// Verify: no .tmp files remain in the output directory (temp file was cleaned up)
		const files = await readdir(outputDir);
		const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
		expect(tmpFiles).toHaveLength(0);
	});
});
