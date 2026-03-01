import { defineCommand } from "citty";
import { cloneCommand } from "./clone-command.js";
import { infoCommand } from "./info-command.js";
import { listCommand } from "./list-command.js";

export const mainCommand = defineCommand({
	meta: {
		name: "cxs-cloner",
		version: "0.1.0",
		description: "CLI tool to clone and modify Codex sessions",
	},
	subCommands: {
		list: listCommand,
		info: infoCommand,
		clone: cloneCommand,
	},
});
