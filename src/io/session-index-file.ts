import { appendFile, readFile } from "node:fs/promises";
import { join } from "pathe";
import { FileOperationError } from "../errors/clone-operation-errors.js";
import type { SessionIndexEntry } from "../types/clone-operation-types.js";

const CLONE_SUFFIX_REGEX = /\s+\(Clone(?:\s+(\d+))?\)$/;

function getSessionIndexPath(codexDir: string): string {
	return join(codexDir, "session_index.jsonl");
}

export async function readSessionIndexName(
	codexDir: string,
	threadId: string,
): Promise<string | null> {
	const filePath = getSessionIndexPath(codexDir);

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError?.code === "ENOENT") {
			return null;
		}
		throw new FileOperationError(
			filePath,
			"read",
			error instanceof Error ? error.message : String(error),
		);
	}

	let lastName: string | null = null;

	for (const line of content.split("\n")) {
		if (line.trim() === "") {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			continue;
		}

		if (!parsed || typeof parsed !== "object") {
			continue;
		}

		const entry = parsed as Partial<SessionIndexEntry>;
		if (entry.id === threadId && typeof entry.thread_name === "string") {
			lastName = entry.thread_name;
		}
	}

	return lastName;
}

export function deriveCloneThreadName(sourceName: string): string {
	const trimmed = sourceName.trim();
	if (trimmed === "") {
		return "(Clone)";
	}

	const match = trimmed.match(CLONE_SUFFIX_REGEX);
	if (!match) {
		return `${trimmed} (Clone)`;
	}

	const baseName = trimmed.replace(CLONE_SUFFIX_REGEX, "");
	const cloneNumber = match[1] ? Number.parseInt(match[1], 10) : 1;
	return `${baseName} (Clone ${cloneNumber + 1})`;
}

export async function appendSessionIndexEntry(
	codexDir: string,
	entry: SessionIndexEntry,
): Promise<void> {
	const filePath = getSessionIndexPath(codexDir);
	const line = `${JSON.stringify(entry)}\n`;

	try {
		await appendFile(filePath, line, "utf-8");
	} catch (error) {
		throw new FileOperationError(
			filePath,
			"write",
			error instanceof Error ? error.message : String(error),
		);
	}
}
