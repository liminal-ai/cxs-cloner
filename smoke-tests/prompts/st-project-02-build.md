Build a bounded v1 TypeScript npm CLI project in this directory.

Project goal:
- Create a Codex JSONL summarizer/navigator CLI.
- It should analyze Codex rollout JSONL files up to 10 MB and emit one
  structured JSON summary object.

Input:
- local Codex rollout JSONL files under ../samples/codex-jsonl/

Required summary output:
- total count of LLM turns
- total count of agentic turns
- estimated token count for the whole session
- estimated token counts broken down by session object type
- array of turn summaries with:
  - 50-character truncation of the user prompt
  - 50-character truncation of the final model message
  - estimated token count for the overall turn

Definitions:
- LLM turn: every model call/response unit as best inferable from the JSONL
- Agentic turn: user prompt to next user prompt boundary; if a user prompts,
  interrupts, and prompts again before a model response, count that as two
  agentic turns

Project requirements:
- TypeScript npm CLI project
- No external services
- Keep runtime dependencies minimal; zero runtime dependencies is preferred
- Include:
  - package.json
  - tsconfig.json
  - src/
  - tests/
  - README.md
  - fixture/sample loader support
  - npm scripts for build, test, and CLI execution

Completion criteria:
- `npm run build` passes
- `npm test` passes
- README explains the summary schema, the turn definitions, and sample usage
- stop after the bounded v1 is complete and verified locally
