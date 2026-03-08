# Codex App Clone Compatibility Plan

## Purpose

This document defines the additional functional requirements for `cxs-cloner` so that a cloned Codex session behaves like a native Codex session as closely as possible in the Codex app and TUI.

This is a functional plan, not an implementation plan. It focuses on what must be true after cloning, what additional artifacts must be updated, and what consistency expectations the clone output must satisfy.

## Goal

After cloning a Codex session, the resulting session should:

- be discoverable by the Codex app and TUI session picker
- be resumable through normal Codex flows
- carry internally consistent session metadata
- sort and display in ways that make sense relative to native sessions
- avoid corrupting or bypassing the normal Codex session discovery model

## Non-Goals

- Do not add direct SQLite writes as a default part of cloning
- Do not invent a separate clone-only session storage model
- Do not rely on undocumented app internals when the normal rollout-based discovery path is sufficient
- Do not optimize first for archived-session support unless required

## Existing Discovery Model

Codex session discovery is driven primarily by rollout files under the normal Codex home directories, with SQLite acting as a repairable index/cache layer.

This means the safest clone strategy is:

- produce a valid rollout in the expected sessions directory layout
- ensure rollout metadata is internally coherent
- let Codex repair or populate SQLite state naturally through its normal discovery path

## Required Functional Changes

### 1. Write Clones Into the Native Active Sessions Layout

When cloning to the default Codex output location, the cloned rollout must be written into the same dated session tree used by native Codex sessions:

- `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-<uuid>.jsonl`

Requirements:

- default output must continue to land in the active sessions tree, not an arbitrary flat directory
- the directory structure must reflect the clone timestamp
- the filename timestamp and session UUID must be valid for Codex session discovery

Why this matters:

- the Codex app and TUI scan the normal sessions tree when listing threads
- placing the rollout elsewhere makes discovery unreliable or impossible through normal UI flows

### 2. Keep Rollout File Identity Internally Consistent

The cloned rollout must have a new session/thread identity that is coherent everywhere Codex expects it.

Requirements:

- the UUID in the output filename must match the cloned session ID inside session metadata
- the cloned rollout must not reuse the source session UUID
- all clone-time identity updates must be internally consistent across the file

Why this matters:

- Codex path lookup and thread resolution are UUID-driven
- mismatches between filename ID and session metadata can break discovery, resume, archive, or fork flows

### 3. Preserve a Valid Session Meta Record

The cloned rollout must contain a valid session metadata record that remains readable by Codex.

Requirements:

- keep a valid `session_meta` record in the rollout
- ensure session metadata reflects the cloned thread identity
- preserve the metadata fields Codex needs for source/provider/cwd/model interpretation

Why this matters:

- Codex uses session metadata during session listing, resume, and DB reconciliation
- missing or malformed session metadata will make the session behave unlike a native session

### 4. Update Clone Timestamps So the Session Sorts Like a Newly Created Session

The clone should present as a newly created session, not as an old session with a new filename.

Requirements:

- update `session_meta.payload.timestamp` to the clone time
- update the envelope timestamp on the `session_meta` line to match or align with the clone time
- ensure the dated output path and filename timestamp correspond to the same clone event

Why this matters:

- Codex derives created-time semantics from session metadata and rollout naming
- clones should sort and display in a way that matches user expectations for newly created sessions

### 5. Preserve At Least One User Message Event

The cloned rollout must continue to look like a real interactive session, not just a metadata container.

Requirements:

- preserve at least one valid `user_message` event in the rollout
- do not allow aggressive stripping modes to remove all user-message evidence
- treat preservation of a user message as a discovery compatibility requirement, not just a best effort

Why this matters:

- Codex thread listing logic expects both session metadata and user-message evidence for a session to count as a real thread

### 6. Preserve Interactive Session Eligibility

The clone must remain eligible for the same session filters used by the app and TUI.

Requirements:

- preserve a compatible session source for interactive listing
- preserve enough provider metadata that the app/TUI will not exclude the clone under default filters
- preserve cwd metadata so project-scoped listing continues to work

Why this matters:

- Codex filters listed sessions by source/provider and often by cwd context
- a valid rollout that fails those filters may still not appear where users expect

## Strongly Recommended Additional Changes

### 7. Record Clone Lineage in Metadata

Clones should explicitly retain where they came from.

Requirements:

- set clone lineage fields such as `forked_from_id` when a clone is created from an existing session

Why this matters:

- lineage improves future introspection and debugging
- it keeps clone semantics closer to native fork-like behavior where supported

### 8. Append a Name Entry to `session_index.jsonl`

Codex uses `session_index.jsonl` for thread-name lookup and name-based resolution.

Requirements:

- append a new session index entry for the cloned session ID when a meaningful clone name exists
- ensure the session index entry has:
  - cloned session ID
  - thread name
  - updated timestamp

Why this matters:

- the clone can still be discoverable without this
- but adding the index entry makes named display and name-based lookup work more like native sessions

### 9. Use Clone-Appropriate Naming

If clone naming is supported, the clone should look intentional rather than malformed or identical to the source.

Requirements:

- create or preserve a reasonable thread name for the cloned session
- avoid ambiguous names that make source and clone hard to distinguish
- keep naming consistent with any entry written to `session_index.jsonl`

Why this matters:

- cloned sessions become easier to identify in app lists and picker flows
- this reduces confusion when repeatedly cloning long-running sessions

## Optional Future Support

### 10. Archived Clone Support

If archive-oriented output is added later, it must follow Codex archived-session conventions rather than the active-session layout.

Requirements:

- archived output should live under `~/.codex/archived_sessions/`
- archive output should follow the archived rollout naming expectations used by Codex

This is optional and should not block active-session compatibility.

## Explicitly Not Required by Default

### Direct SQLite Writes

Do not add direct writes to the Codex SQLite state database as a default cloning step.

Reason:

- Codex already performs filesystem-first discovery and read-repair into SQLite
- direct DB writes increase risk and couple the cloner to internal persistence details unnecessarily

Direct DB mutation should only be considered later if there is a proven user-facing gap that the normal rollout discovery path cannot cover.

## Consistency Rules

After cloning, the following should all agree with each other:

- output path location
- filename timestamp
- filename UUID
- session metadata ID
- session metadata timestamp
- clone lineage fields
- session index entry, if written

The clone should feel like a session Codex itself could plausibly have created, not a foreign artifact that merely happens to parse.

## Functional Acceptance Criteria

### AC-1: Clone is discoverable in Codex app/TUI

Given a cloned session written to the default output location,
when Codex lists sessions,
then the cloned session appears in normal session browsing flows.

### AC-2: Clone is resumable through normal Codex resume/fork flows

Given a cloned session discovered by Codex,
when the user selects or resumes it,
then Codex can continue the session without rollout identity/path errors.

### AC-3: Clone sorts like a newly created session

Given a newly cloned session,
when sessions are ordered by created/updated recency,
then the clone appears with timing consistent with the clone operation, not with the original session creation time.

### AC-4: Clone remains compatible with project/provider filters

Given a source session that would normally appear in project/provider-scoped session lists,
when it is cloned,
then the clone still appears under the expected filters unless the user intentionally outputs it elsewhere.

### AC-5: Clone naming is coherent

Given clone naming support is enabled,
when the user browses or resolves sessions by name,
then the clone is distinguishable and its name maps correctly to its session ID.

### AC-6: No direct DB dependency is required

Given only rollout-file output plus related file-based metadata updates,
when Codex scans sessions,
then the clone becomes visible and SQLite state is repaired naturally if needed.

## Recommended Release Scope

The safest near-term scope for `cxs-cloner` is:

1. ensure active-session layout is correct
2. ensure metadata ID/timestamp consistency
3. preserve required user-message/session-meta records
4. append `session_index.jsonl` for improved naming/display
5. avoid SQLite writes

That scope should make cloned sessions work smoothly in the app while keeping the cloner aligned with native Codex session behavior.
