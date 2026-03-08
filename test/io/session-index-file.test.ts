import { describe, expect, test } from "bun:test";
import {
	appendSessionIndexEntry,
	deriveCloneThreadName,
	readSessionIndexName,
} from "../../src/io/session-index-file.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";

describe("session-index-file", () => {
	test("deriveCloneThreadName appends first clone suffix", () => {
		expect(deriveCloneThreadName("Task review")).toBe("Task review (Clone)");
	});

	test("deriveCloneThreadName increments normalized clone suffixes", () => {
		expect(deriveCloneThreadName("Task review (Clone)")).toBe(
			"Task review (Clone 2)",
		);
		expect(deriveCloneThreadName("Task review (Clone 2)")).toBe(
			"Task review (Clone 3)",
		);
	});

	test("appendSessionIndexEntry writes native JSONL and readSessionIndexName returns the latest match", async () => {
		const codexDir = await mkdtemp(join(tmpdir(), "cxs-session-index-"));

		try {
			await appendSessionIndexEntry(codexDir, {
				id: "source-id",
				thread_name: "Original session",
				updated_at: "2026-03-06T23:12:17.810Z",
			});
			await appendSessionIndexEntry(codexDir, {
				id: "source-id",
				thread_name: "Original session renamed",
				updated_at: "2026-03-06T23:12:18.810Z",
			});

			const content = await readFile(
				join(codexDir, "session_index.jsonl"),
				"utf-8",
			);
			const lines = content.trim().split("\n");

			expect(lines).toHaveLength(2);
			expect(await readSessionIndexName(codexDir, "source-id")).toBe(
				"Original session renamed",
			);
		} finally {
			await rm(codexDir, { recursive: true, force: true });
		}
	});
});
