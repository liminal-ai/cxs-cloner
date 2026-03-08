import { describe, expect, test } from "bun:test";
import { formatCloneResult } from "../../src/output/clone-result-formatter.js";
import type { CloneResult } from "../../src/types/clone-operation-types.js";

function makeCloneResult(overrides?: Partial<CloneResult>): CloneResult {
	return {
		operationSucceeded: true,
		clonedThreadId: "new-uuid-1234",
		clonedSessionFilePath: "/tmp/sessions/2026/02/28/rollout-new.jsonl",
		sourceThreadId: "source-uuid-5678",
		sourceSessionFilePath: "/tmp/sessions/2026/01/01/rollout-old.jsonl",
		cloneTimestamp: "2026-03-06T23:12:17.810Z",
		cloneThreadName: "Hello from clone test (Clone)",
		sessionIndexUpdated: true,
		resumable: true,
		statistics: {
			turnCountOriginal: 30,
			turnCountOutput: 20,
			functionCallsRemoved: 10,
			functionCallsTruncated: 5,
			reasoningBlocksRemoved: 8,
			eventMessagesRemoved: 50,
			turnContextRecordsRemoved: 10,
			ghostSnapshotsRemoved: 3,
			compactionDetected: false,
			compactedRecordCount: 0,
			originalSizeBytes: 100000,
			outputSizeBytes: 40000,
			fileSizeReductionPercent: 60,
		},
		...overrides,
	};
}

describe("formatCloneResult", () => {
	// TC-8.5.2: --json flag produces JSON output
	test("TC-8.5.2: JSON output is valid JSON with expected fields", () => {
		const result = makeCloneResult();
		const output = formatCloneResult(result, { json: true, verbose: false });

		const parsed = JSON.parse(output);
		expect(parsed.success).toBe(true);
		expect(parsed.clonedThreadId).toBe("new-uuid-1234");
		expect(parsed.sourceThreadId).toBe("source-uuid-5678");
		expect(parsed.cloneTimestamp).toBe("2026-03-06T23:12:17.810Z");
		expect(parsed.cloneThreadName).toBe("Hello from clone test (Clone)");
		expect(parsed.sessionIndexUpdated).toBe(true);
		expect(parsed.resumable).toBe(true);
		expect(parsed.statistics.turnCountOriginal).toBe(30);
		expect(parsed.statistics.turnCountOutput).toBe(20);
		expect(parsed.statistics.functionCallsRemoved).toBe(10);
		expect(parsed.statistics.functionCallsTruncated).toBe(5);
		expect(parsed.statistics.reasoningBlocksRemoved).toBe(8);
		expect(parsed.statistics.eventMessagesRemoved).toBe(50);
		expect(parsed.statistics.turnContextRecordsRemoved).toBe(10);
		expect(parsed.statistics.ghostSnapshotsRemoved).toBe(3);
		expect(parsed.statistics.originalSizeBytes).toBe(100000);
		expect(parsed.statistics.outputSizeBytes).toBe(40000);
		expect(parsed.statistics.fileSizeReductionPercent).toBe(60);
	});

	test("human-readable output includes resume command when resumable", () => {
		const result = makeCloneResult({ resumable: true });
		const output = formatCloneResult(result, {
			json: false,
			verbose: false,
		});

		expect(output).toContain("codex resume new-uuid-1234");
		expect(output).toContain("Clone completed successfully");
		expect(output).toContain("Hello from clone test (Clone)");
		expect(output).toContain("Session index: updated");
		expect(output).toContain("Removed:");
	});

	test("human-readable output shows warning when not resumable", () => {
		const result = makeCloneResult({
			resumable: false,
			sessionIndexUpdated: false,
		});
		const output = formatCloneResult(result, {
			json: false,
			verbose: false,
		});

		expect(output).toContain("Custom output path");
		expect(output).toContain("Session index: not updated");
		// Should not show the resume command line (Resume with: codex resume <id>)
		expect(output).not.toContain("Resume with:");
	});

	test("verbose output includes detailed removal counts", () => {
		const result = makeCloneResult();
		const output = formatCloneResult(result, {
			json: false,
			verbose: true,
		});

		expect(output).toContain("Tool calls:");
		expect(output).toContain("Reasoning:");
		expect(output).toContain("Event messages:");
		expect(output).toContain("Turn contexts:");
		expect(output).toContain("Ghost snapshots:");
	});

	test("human-readable output includes target cwd when applied", () => {
		const result = makeCloneResult({
			targetCwdApplied: "/Users/test/new-project",
		});
		const output = formatCloneResult(result, {
			json: false,
			verbose: false,
		});

		expect(output).toContain("Target:  /Users/test/new-project");
	});

	test("human-readable output omits target line when not applied", () => {
		const result = makeCloneResult();
		const output = formatCloneResult(result, {
			json: false,
			verbose: false,
		});

		expect(output).not.toContain("Target:");
	});

	test("JSON output includes targetCwdApplied when set", () => {
		const result = makeCloneResult({
			targetCwdApplied: "/Users/test/new-project",
		});
		const output = formatCloneResult(result, { json: true, verbose: false });
		const parsed = JSON.parse(output);

		expect(parsed.targetCwdApplied).toBe("/Users/test/new-project");
	});

	test("compaction info shown when detected", () => {
		const result = makeCloneResult({
			statistics: {
				...makeCloneResult().statistics,
				compactionDetected: true,
				compactedRecordCount: 2,
			},
		});
		const output = formatCloneResult(result, {
			json: false,
			verbose: false,
		});

		expect(output).toContain("Compaction detected");
		expect(output).toContain("2");
	});
});
