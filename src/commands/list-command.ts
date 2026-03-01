import { defineCommand } from "citty";
import consola from "consola";
import { loadConfiguration } from "../config/configuration-loader.js";
import { CxsError } from "../errors/clone-operation-errors.js";
import { scanSessionDirectory } from "../io/session-directory-scanner.js";
import { readSessionMetadata } from "../io/session-file-reader.js";
import { formatSessionList } from "../output/session-formatters.js";
import type { SessionMetadata } from "../types/clone-operation-types.js";

export const listCommand = defineCommand({
	meta: {
		name: "list",
		description: "List Codex sessions sorted by recency",
	},
	args: {
		limit: {
			type: "string",
			description: "Maximum number of sessions to display",
		},
		"codex-dir": {
			type: "string",
			description: "Override default Codex directory (~/.codex)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
		verbose: {
			type: "boolean",
			description: "Show additional metadata (model, cwd, git branch)",
			default: false,
		},
	},
	async run({ args }) {
		const limit = args.limit ? Number.parseInt(args.limit, 10) : undefined;
		const jsonOutput = args.json ?? false;
		const verbose = args.verbose ?? false;

		if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
			consola.error("--limit must be a positive number");
			process.exit(1);
		}

		try {
			const cxsConfig = await loadConfiguration(
				args["codex-dir"] ? { codexDir: args["codex-dir"] } : undefined,
			);
			const codexDir = cxsConfig.codexDir;
			const sessions = await scanSessionDirectory(codexDir, { limit });

			// Read metadata for each session
			const metadataList: SessionMetadata[] = [];
			for (const session of sessions) {
				try {
					const metadata = await readSessionMetadata(session.filePath);
					metadataList.push(metadata);
				} catch (error) {
					consola.warn(
						`Could not read metadata for ${session.fileName}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
			const output = formatSessionList(metadataList, {
				json: jsonOutput,
				verbose,
			});
			if (metadataList.length === 0 && !jsonOutput) {
				consola.info(output);
				return;
			}
			console.log(output);
		} catch (error) {
			if (error instanceof CxsError) {
				consola.error(error.message);
				process.exit(1);
			}
			throw error;
		}
	},
});
