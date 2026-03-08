# Codex JSONL Summarizer

Bounded v1 TypeScript CLI for summarizing local Codex rollout JSONL files up to 10 MB into one structured JSON object.

## What it does

Given a Codex rollout JSONL file, the CLI emits:

- `llmTurnCount`: total inferred model call/response units
- `agenticTurnCount`: total user-prompt-to-next-user-prompt turns
- `estimatedSessionTokenCount`: estimated token count for the whole JSONL session
- `estimatedTokenCountByObjectType`: estimated token totals grouped by top-level JSONL record `type`
- `turnSummaries`: one summary per agentic turn with:
  - `userPromptPreview`: user prompt truncated to 50 characters
  - `finalModelMessagePreview`: final model-authored message truncated to 50 characters
  - `estimatedTokenCount`: estimated token count across the whole turn boundary

## Turn definitions

- LLM turn: counted from explicit turn starts when present (`turn_context`, then `event_msg.task_started`), but only when that range contains assistant activity. If neither signal exists, the CLI falls back to grouped assistant activity as a best-effort inference.
- Agentic turn: every real user prompt boundary. Mirrored `response_item` plus `event_msg.user_message` pairs count once, while response-only prompts are still preserved so mixed rollouts do not merge turns.
- Final model preview: taken from the last assistant-authored message in the turn, including `event_msg.task_complete.last_agent_message` when that is the only final wrap-up text.

## Token estimation

This v1 uses a simple local heuristic: estimated tokens are `ceil(raw_json_characters / 4)`. The estimate is based on the JSONL source text, so it is stable, offline, and consistent across whole-session, per-type, and per-turn totals.

## Input handling

- Inputs must be regular UTF-8 `.jsonl` files.
- Files larger than 10 MB are rejected before parsing.
- Invalid JSON reports the failing line number.

## Usage

```bash
npm install
npm run build
npm run cli -- ../samples/codex-jsonl/019cac52-12f3-7801-8e23-10a122c41ca1.jsonl
```

Sample helpers:

```bash
npm run cli -- --list-samples
npm run cli -- --sample 019cac52-12f3-7801-8e23-10a122c41ca1.jsonl
npm run cli -- --list-fixtures
npm run cli -- --fixture sample-rollout.jsonl
```

## Summary schema

```json
{
  "filePath": "/absolute/path/to/rollout.jsonl",
  "fileSizeBytes": 12345,
  "llmTurnCount": 12,
  "agenticTurnCount": 4,
  "estimatedSessionTokenCount": 6789,
  "estimatedTokenCountByObjectType": {
    "event_msg": 2100,
    "response_item": 3900,
    "session_meta": 400,
    "turn_context": 389
  },
  "turnSummaries": [
    {
      "userPromptPreview": "Summarize the errors from the last deploy...",
      "finalModelMessagePreview": "I found two likely regressions in the API...",
      "estimatedTokenCount": 1540
    }
  ]
}
```

## Project structure

- `src/index.ts`: parser, summarizer, token estimation, and loader helpers
- `src/cli.ts`: command-line entry point
- `tests/fixtures/`: JSONL fixtures
- `tests/summarizer.test.ts`: unit and CLI coverage

## Scripts

- `npm run build`: compile TypeScript to `dist/`
- `npm test`: build and run the Node test suite
- `npm run cli -- <args>`: run the compiled CLI
