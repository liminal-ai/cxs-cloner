# Manual Smoke Log

Append dated notes here after running the manual smoke workflow.

Template:

## YYYY-MM-DD

- Clone target:
- Preset:
- New clone ID:
- CLI resume result:
- Codex app listing result:
- Metadata/index consistency check:
- Notes:

## 2026-03-07

- Clone target: `st-project-01 build` (`019cc8ef-2631-72b3-9add-f76c4585677b`)
- Preset: `default`
- New clone ID: `323e620b-03dd-4b6d-a9bb-716d91d1db7a`
- CLI resume result: pass; `codex exec resume` recovered prior assistant context and replied with a concrete earlier implementation-summary sentence rather than `NO_HISTORY`
- Codex app listing result: not rechecked in UI during this run; filesystem/list flow passed and the clone appears through `cxs-cloner list`
- Metadata/index consistency check: pass for rollout path, `session_meta.id`, `session_meta.timestamp`, `forked_from_id`, and appended `session_index.jsonl` entry
- Notes: found a real naming bug. The clone name fell back to the huge AGENTS/environment first user prompt instead of a useful human session title, so `session_index.jsonl` now contains an unusably long `thread_name` for this clone.

## 2026-03-08

- Clone target: `st-project-01 build` (`019cc8ef-2631-72b3-9add-f76c4585677b`)
- Preset: `default`
- New clone ID: `f65d2150-36ff-4586-91de-d84eb9468f9e`
- CLI resume result: not re-probed in this rerun; prior manual smoke resume had already passed and this rerun targeted the naming fix specifically
- Codex app listing result: not rechecked in UI during this rerun
- Metadata/index consistency check: pass; latest `session_index.jsonl` entry now uses `Build a bounded v1 TypeScript npm CLI project in this directory. (Clone)`
- Notes: verified the naming-fallback fix. Bootstrap AGENTS/environment prompts are ignored, and multiline build prompts now derive the clone title from the first real prompt line only.
