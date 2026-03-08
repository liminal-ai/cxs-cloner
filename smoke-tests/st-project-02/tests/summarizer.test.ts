import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
	ESTIMATED_TOKEN_COUNT_HEURISTIC,
	listFixtureRollouts,
	listSampleRollouts,
	MAX_INPUT_BYTES,
	resolveFixturePath,
	summarizeSession,
	truncatePreview,
} from "../src/index.js";

function createTempInputFile(
	contents: string | Buffer,
	fileName = "rollout.jsonl",
): { inputPath: string; tempDirectory: string } {
	const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "codex-jsonl-"));
	const inputPath = path.join(tempDirectory, fileName);
	writeFileSync(inputPath, contents);
	return { inputPath, tempDirectory };
}

describe("summarizeSession", () => {
	it("summarizes a representative rollout fixture", () => {
		const inputPath = resolveFixturePath("sample-rollout.jsonl");
		const summary = summarizeSession(inputPath);

		assert.equal(summary.filePath, inputPath);
		assert.equal(summary.recordCount, 13);
		assert.equal(summary.llmTurnCount, 3);
		assert.equal(summary.llmTurnCountSource, "turn_context");
		assert.equal(summary.agenticTurnCount, 2);
		assert.equal(
			summary.estimatedTokenCountHeuristic,
			ESTIMATED_TOKEN_COUNT_HEURISTIC,
		);
		assert.equal(summary.turnSummaries.length, 2);
		assert.equal(
			summary.turnSummaries[0].userPromptPreview,
			truncatePreview("First prompt about summary quality and token estimates."),
		);
		assert.equal(
			summary.turnSummaries[0].finalModelMessagePreview,
			truncatePreview("Tool-assisted follow-up complete with a concise wrap-up."),
		);
		assert.ok(summary.turnSummaries[0].estimatedTokenCount > 0);
		assert.equal(summary.turnSummaries[0].recordCount, 8);
		assert.equal(
			summary.turnSummaries[1].userPromptPreview,
			truncatePreview("Second prompt for follow-up with more detail than before."),
		);
		assert.equal(
			summary.turnSummaries[1].finalModelMessagePreview,
			truncatePreview("Second answer final model output with more detail."),
		);
		assert.ok(summary.turnSummaries[1].estimatedTokenCount > 0);
		assert.equal(summary.turnSummaries[1].recordCount, 3);
		assert.ok(
			summary.turnSummaries[0].estimatedTokenCount >
				summary.turnSummaries[1].estimatedTokenCount,
		);
		assert.equal(
			summary.estimatedSessionTokenCount,
			Object.values(summary.estimatedTokenCountByObjectType).reduce(
				(total, tokenCount) => total + tokenCount,
				0,
			),
		);
	});

	it("counts interrupted user prompts as separate agentic turns", () => {
		const inputPath = resolveFixturePath("interrupted-rollout.jsonl");
		const summary = summarizeSession(inputPath);

		assert.equal(summary.agenticTurnCount, 2);
		assert.equal(summary.turnSummaries[0].userPromptPreview, "Start a long task, please.");
		assert.equal(summary.turnSummaries[0].finalModelMessagePreview, "");
		assert.equal(summary.turnSummaries[1].userPromptPreview, "Actually stop and do the short version.");
		assert.equal(
			summary.turnSummaries[1].finalModelMessagePreview,
			"Short version complete.",
		);
	});

	it("counts response-only user prompts even when event-backed prompts also exist", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			[
				'{"timestamp":"2026-03-02T10:00:00.000Z","type":"session_meta","payload":{"id":"mixed-sources"}}',
				'{"timestamp":"2026-03-02T10:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"First prompt with an event mirror."}]}}',
				'{"timestamp":"2026-03-02T10:00:01.100Z","type":"event_msg","payload":{"type":"user_message","message":"First prompt with an event mirror."}}',
				'{"timestamp":"2026-03-02T10:00:02.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"First answer."}]}}',
				'{"timestamp":"2026-03-02T10:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Second prompt only exists as a response item."}]}}',
				'{"timestamp":"2026-03-02T10:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Second answer."}]}}',
				'{"timestamp":"2026-03-02T10:00:05.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Third prompt has both records again."}]}}',
				'{"timestamp":"2026-03-02T10:00:05.100Z","type":"event_msg","payload":{"type":"user_message","message":"Third prompt has both records again."}}',
				'{"timestamp":"2026-03-02T10:00:06.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Third answer."}]}}',
			].join("\n"),
		);

		try {
			const summary = summarizeSession(inputPath);

			assert.equal(summary.agenticTurnCount, 3);
			assert.equal(summary.llmTurnCount, 3);
			assert.deepEqual(
				summary.turnSummaries.map((turnSummary) => turnSummary.userPromptPreview),
				[
					"First prompt with an event mirror.",
					"Second prompt only exists as a response item.",
					"Third prompt has both records again.",
				],
			);
			assert.deepEqual(
				summary.turnSummaries.map(
					(turnSummary) => turnSummary.finalModelMessagePreview,
				),
				["First answer.", "Second answer.", "Third answer."],
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("uses task_complete.last_agent_message for the final model preview", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			[
				'{"timestamp":"2026-03-02T11:00:00.000Z","type":"session_meta","payload":{"id":"task-complete-preview"}}',
				'{"timestamp":"2026-03-02T11:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Wrap up after the tool call."}]}}',
				'{"timestamp":"2026-03-02T11:00:01.100Z","type":"event_msg","payload":{"type":"user_message","message":"Wrap up after the tool call."}}',
				'{"timestamp":"2026-03-02T11:00:02.000Z","type":"turn_context","payload":{"turn_id":"turn_0","cwd":"/tmp/project","model":"gpt-5.4"}}',
				'{"timestamp":"2026-03-02T11:00:03.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"call_1","arguments":"{\\"cmd\\":\\"pwd\\"}"}}',
				'{"timestamp":"2026-03-02T11:00:04.000Z","type":"event_msg","payload":{"type":"task_complete","last_agent_message":"Final wrap-up came from task_complete."}}',
			].join("\n"),
		);

		try {
			const summary = summarizeSession(inputPath);

			assert.equal(summary.agenticTurnCount, 1);
			assert.equal(summary.llmTurnCount, 1);
			assert.equal(
				summary.turnSummaries[0].finalModelMessagePreview,
				"Final wrap-up came from task_complete.",
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("counts only assistant-backed task_started ranges as llm turns", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			[
				'{"timestamp":"2026-03-02T12:00:00.000Z","type":"session_meta","payload":{"id":"task-started-fallback"}}',
				'{"timestamp":"2026-03-02T12:00:01.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn_0"}}',
				'{"timestamp":"2026-03-02T12:00:02.000Z","type":"event_msg","payload":{"type":"turn_aborted","reason":"user_interrupt"}}',
				'{"timestamp":"2026-03-02T12:00:03.000Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn_1"}}',
				'{"timestamp":"2026-03-02T12:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Recovered answer."}]}}',
			].join("\n"),
		);

		try {
			const summary = summarizeSession(inputPath);

			assert.equal(summary.llmTurnCount, 1);
			assert.equal(summary.llmTurnCountSource, "task_started");
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("reports assistant-activity fallback when explicit turn markers are absent", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			[
				'{"timestamp":"2026-03-02T12:30:00.000Z","type":"session_meta","payload":{"id":"assistant-activity-fallback"}}',
				'{"timestamp":"2026-03-02T12:30:01.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"First answer."}]}}',
				'{"timestamp":"2026-03-02T12:30:02.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"call_1","arguments":"{\\"cmd\\":\\"pwd\\"}"}}',
				'{"timestamp":"2026-03-02T12:30:03.000Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_1","output":"/tmp/project"}',
				'{"timestamp":"2026-03-02T12:30:04.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Second answer."}}',
			].join("\n"),
		);

		try {
			const summary = summarizeSession(inputPath);

			assert.equal(summary.llmTurnCount, 2);
			assert.equal(summary.llmTurnCountSource, "assistant_activity");
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("enforces the 10 MB input limit", () => {
		const oversizedLine = `${"x".repeat(1024)}\n`;
		const { inputPath, tempDirectory } = createTempInputFile(
			oversizedLine.repeat(Math.ceil(MAX_INPUT_BYTES / oversizedLine.length) + 1),
			"oversized.jsonl",
		);

		try {
			assert.throws(
				() => summarizeSession(inputPath),
				/Input file exceeds 10 MB limit/,
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("surfaces invalid JSON with the correct line number across CRLF input", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			[
				'{"timestamp":"2026-03-02T13:00:00.000Z","type":"session_meta","payload":{"id":"crlf-invalid-json"}}',
				'',
				'{"timestamp":"2026-03-02T13:00:01.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Broken line"}]}}',
				'{"timestamp":"2026-03-02T13:00:02.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Missing brace"}',
			].join("\r\n"),
			"invalid-json-crlf.jsonl",
		);

		try {
			assert.throws(
				() => summarizeSession(inputPath),
				/Invalid JSON on line 4:/,
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("rejects invalid UTF-8 input before parsing", () => {
		const { inputPath, tempDirectory } = createTempInputFile(
			Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
			"invalid-utf8.jsonl",
		);

		try {
			assert.throws(
				() => summarizeSession(inputPath),
				/Input file is not valid UTF-8/,
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("rejects missing files with a clear error", () => {
		const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "codex-jsonl-"));
		const inputPath = path.join(tempDirectory, "missing.jsonl");

		try {
			assert.throws(
				() => summarizeSession(inputPath),
				/Input file does not exist/,
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("rejects directory paths with a clear error", () => {
		const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "codex-jsonl-"));
		const inputPath = path.join(tempDirectory, "directory-input");
		mkdirSync(inputPath);

		try {
			assert.throws(
				() => summarizeSession(inputPath),
				/Input path is not a file/,
			);
		} finally {
			rmSync(tempDirectory, { recursive: true, force: true });
		}
	});
});

describe("loader helpers", () => {
	it("lists fixture rollouts and real sample rollouts", () => {
		assert.ok(listFixtureRollouts().includes("sample-rollout.jsonl"));
		assert.ok(listFixtureRollouts().includes("interrupted-rollout.jsonl"));
		assert.ok(listSampleRollouts().length > 0);
	});
});

describe("CLI", () => {
	it("prints a structured JSON summary for a fixture", () => {
		const cliPath = path.resolve(process.cwd(), "dist", "src", "cli.js");
		const result = spawnSync("node", [cliPath, "--fixture", "sample-rollout.jsonl"], {
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.recordCount, 13);
		assert.equal(summary.llmTurnCount, 3);
		assert.equal(summary.llmTurnCountSource, "turn_context");
		assert.equal(summary.agenticTurnCount, 2);
	});
});
