# Codex Integration

Patterns for using Codex CLI subagents within team orchestration workflows.

## Skill Dependencies

Teammates that manage Codex subagents need to read two skills:
- `~/.claude/skills/codex-subagent/SKILL.md` — how to launch, manage, and extract results from Codex CLI
- Keep Codex handoffs concise — pass the artifact set, target outcome, and verification expectations without turning the prompt into a separate prompt-engineering exercise

These are user-level skills, not plugin skills. Teammates won't have them in their system prompt automatically — they need explicit instructions to read the SKILL.md files and their references.

## Prompting Codex

When a teammate prompts Codex for implementation, Codex should receive the same artifacts the teammate has — the story, the epic (if available), and the tech design (if available). Don't over-prescribe. Codex is a capable implementer when given good specifications. Keep prompts lean and execution-oriented.

The teammate has discretion to dial in the prompt based on circumstances — story complexity, gotchas noticed during reading, spec deviations that need attention.

## Async Launch

Launch Codex async (background) to avoid timeout constraints. The teammate waits for completion. This eliminates the context ceiling and timeout failure modes that occur with synchronous execution on long tasks.

## Read-Only Mode

For review tasks, launch Codex with `-s read-only` sandbox mode. The reviewer teammate captures the output and writes it to the designated location. Codex reviews but doesn't modify the codebase.

## Model Selection

- **gpt-5.3-codex** — the default for implementation and code review throughout the story cycle
- **gpt-5.2** (not gpt-5.2-codex — different tune) — used only as one of the four epic-level verification reviewers, launched via `-m gpt-5.2`
