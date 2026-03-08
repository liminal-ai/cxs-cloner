# Smoke-Test Data Workspace

This directory is used to generate real native Codex sessions that later support
manual smoke validation and fixture selection for `cxs-cloner`.

Rules:

- Source smoke data must be generated natively by Codex in the intended project
  directory.
- Do not create the source smoke data by cloning or post-processing other
  sessions.
- Keep prompt assets versioned under `smoke-tests/prompts/`.
- Record every generated session in `smoke-tests/manifest/session-manifest.json`.
- `smoke-tests/samples/codex-jsonl/` may contain copied real local rollout files
  for analysis by the second smoke project.
- Use `node smoke-tests/list-reference-sessions.mjs` to print the current
  reference session IDs and rollout paths.

Projects:

- `st-project-01/`: deterministic text smoothing CLI
- `st-project-02/`: Codex JSONL summarizer CLI

Session sequence per project:

1. Build v1 in a fresh Codex session.
2. Assess the project from a fresh Codex session.
3. Implement the assessment improvements from a fresh Codex session.

## Reference Dataset

Current native smoke-session dataset:

- `st-project-01 build`: `019cc8ef-2631-72b3-9add-f76c4585677b`
- `st-project-01 assessment`: `019cc8f7-a39e-7b01-af1c-86e031c23d42`
- `st-project-01 improvements`: `019cc8fc-f0dd-71f2-8d56-13be7ac1a120`
- `st-project-02 build`: `019cc903-daa3-7b11-b6b6-62fd63f52238`
- `st-project-02 assessment`: `019cc90b-3855-7b82-85bf-1b27f04c6d5c`
- `st-project-02 improvements`: `019cc91f-ad98-7a53-9f3a-0d45724e765c`

For full rollout paths and notes:

```bash
node smoke-tests/list-reference-sessions.mjs
```

## Manual Smoke Workflow

Run manual smoke checks locally against the reference dataset. These are opt-in
and should not be wired into default CI.

1. Pick one build session from `st-project-01` and one assessment or
   improvements session from `st-project-02`.
2. Run a default clone from the repo root, for example:

```bash
bun run src/cli.ts clone 019cc8ef-2631-72b3-9add-f76c4585677b --codex-dir ~/.codex --strip-tools default
```

3. Optionally run a heavier preset comparison:

```bash
bun run src/cli.ts clone 019cc91f-ad98-7a53-9f3a-0d45724e765c --codex-dir ~/.codex --strip-tools heavy
```

4. Verify:
   - the clone appears in `cxs-cloner list` / filesystem listing
   - the clone appears in Codex app after refresh or restart
   - `codex resume <new-id>` shows usable assistant back-history
   - rollout filename/path, `session_meta`, and `session_index.jsonl` agree on
     the new thread identity
   - heavier presets reduce context-bearing content without erasing replay
     history
5. Record the outcome in `smoke-tests/manifest/manual-smoke-log.md`.
