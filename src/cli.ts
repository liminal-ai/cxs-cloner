#!/usr/bin/env bun

import { runMain } from "citty";
import { normalizeArgs } from "./cli/normalize-args.js";
import { mainCommand } from "./commands/main-command.js";

const argv = normalizeArgs(process.argv.slice(2));
runMain(mainCommand, { rawArgs: argv });
