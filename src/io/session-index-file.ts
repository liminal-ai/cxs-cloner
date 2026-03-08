import { createReadStream } from "node:fs";
import { appendFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import consola from "consola";
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

	let lastName: string | null = null;

	const stream = createReadStream(filePath, { encoding: "utf-8" });

	// createReadStream emits errors asynchronously (including ENOENT)
	const streamError = await new Promise<NodeJS.ErrnoException | null>(
		(resolve) => {
			stream.once("error", resolve);
			stream.once("readable", () => resolve(null));
			stream.once("end", () => resolve(null));
		},
	);

	if (streamError) {
		stream.destroy();
		if (streamError.code === "ENOENT") {
			return null;
		}
		throw new FileOperationError(
			filePath,
			"read",
			streamError.message,
		);
	}

	const rl = createInterface({
		input: stream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	for await (const line of rl) {
		if (line.trim() === "") {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			consola.debug(`Skipping malformed line in session index: ${line.slice(0, 80)}`);
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

	rl.close();
	stream.destroy();

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
