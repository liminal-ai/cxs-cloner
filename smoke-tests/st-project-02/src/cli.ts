#!/usr/bin/env node

import path from "node:path";
import {
	getDefaultFixtureDir,
	getDefaultSampleDir,
	listFixtureRollouts,
	listSampleRollouts,
	resolveFixturePath,
	resolveSamplePath,
	summarizeSession,
} from "./index.js";

type CliAction =
	| { type: "usage" }
	| { type: "listed" }
	| { type: "summarize"; inputPath: string };

function main(): void {
	const args = process.argv.slice(2);

	try {
		const action = resolveCliAction(args);

		if (action.type === "usage") {
			process.stderr.write(buildUsage());
			process.exitCode = 1;
			return;
		}

		if (action.type === "listed") {
			return;
		}

		const summary = summarizeSession(action.inputPath);
		process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exitCode = 1;
	}
}

function resolveCliAction(args: string[]): CliAction {
	if (args.includes("--list-samples")) {
		process.stdout.write(`${JSON.stringify(listSampleRollouts(), null, 2)}\n`);
		return { type: "listed" };
	}

	if (args.includes("--list-fixtures")) {
		process.stdout.write(`${JSON.stringify(listFixtureRollouts(), null, 2)}\n`);
		return { type: "listed" };
	}

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];

		if ((argument === "--sample" || argument === "--fixture") && !args[index + 1]) {
			throw new Error(`Missing file name for ${argument}`);
		}

		if (argument === "--sample") {
			return { type: "summarize", inputPath: resolveSamplePath(args[index + 1]) };
		}

		if (argument === "--fixture") {
			return {
				type: "summarize",
				inputPath: resolveFixturePath(args[index + 1]),
			};
		}

		if (!argument.startsWith("-")) {
			return { type: "summarize", inputPath: path.resolve(argument) };
		}
	}

	return { type: "usage" };
}

function buildUsage(): string {
	return [
		"Usage:",
		"  codex-jsonl-summarizer <path-to-rollout.jsonl>",
		"  codex-jsonl-summarizer --sample <file-name>",
		"  codex-jsonl-summarizer --fixture <file-name>",
		"",
		"Helpers:",
		`  --list-samples   List files in ${getDefaultSampleDir()}`,
		`  --list-fixtures  List files in ${getDefaultFixtureDir()}`,
		"",
	].join("\n");
}

main();
