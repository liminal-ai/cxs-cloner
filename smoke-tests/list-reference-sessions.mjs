#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const manifestPath = path.resolve("smoke-tests/manifest/session-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const flatSessions = Object.entries(manifest.projects).flatMap(
	([projectName, project]) =>
		project.sessions.map((session) => ({
			projectName,
			role: session.role,
			threadId: session.threadId,
			rolloutPath: session.rolloutPath,
			promptFile: session.promptFile,
			note: session.note,
		})),
);

if (process.argv.includes("--json")) {
	process.stdout.write(`${JSON.stringify(flatSessions, null, 2)}\n`);
	process.exit(0);
}

for (const session of flatSessions) {
	process.stdout.write(
		[
			`${session.projectName} :: ${session.role}`,
			`  thread:  ${session.threadId ?? "(missing)"}`,
			`  rollout: ${session.rolloutPath ?? "(missing)"}`,
			`  prompt:  ${session.promptFile}`,
			`  note:    ${session.note}`,
			"",
		].join("\n"),
	);
}
