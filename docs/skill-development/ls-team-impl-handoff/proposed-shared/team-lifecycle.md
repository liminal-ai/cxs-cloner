# Team Lifecycle

Operational patterns for managing agent teammates in tmux team mode.

## Spawning

All teammates are spawned as general-purpose agents with bypassPermissions. Senior-engineer is reserved exclusively for the orchestrator's own quick fixes via subagent — never for teammates.

## Shutdown

Shut down teammates after each phase completes. Don't leave idle teammates running across phase boundaries. Send a shutdown request and wait for confirmation before considering the teammate terminated.

## Idle Notifications Are Unreliable Signals

Teammates emit idle notifications between turns. These are noise during multi-step tasks — a teammate doing a 15-minute implementation will fire multiple idle notifications while actively working. Do not interpret idle notifications as "the agent is done" or "the agent is stuck."

The reliable signal is the teammate's explicit message reporting results. Wait for that. If extended time passes with no message (calibrate based on task complexity), send a brief nudge: "Did you complete the work? Report your results." Don't assume failure from silence alone.

## Context Ceilings

Agents that read large artifact sets and then process review feedback can exhaust their context window. Symptoms: the agent goes idle without completing, or produces truncated/confused output.

The human configures model context size. If an agent hits context limits, the human may need to intervene to adjust model settings. The orchestrator cannot control context size at spawn time — flag the issue and let the human handle it.

## Agents Forget to Report Back

After long multi-step tasks (15+ minutes, dozens of tool calls), agents sometimes complete their work and write results to the console but forget to send the completion message back to the team lead. The "report back to team lead" instruction decays over a long execution chain as it gets displaced by the actual work.

This is structural, not random — longer tasks make it more likely. Place the reporting instruction prominently in the handoff prompt. If two idle notifications pass after expected completion time with no message, send a nudge.

## Sequencing: Wait for Confirmation Before Proceeding

Do not launch the next phase of work until the current agent confirms completion. Specifically:
- Don't launch verification before the implementer signals "done"
- Don't launch the next phase before the current phase is fully verified
- Don't assume file state is final because you can read correct-looking files — the agent may have more changes in flight

The teammate's explicit report is the trigger for the next step, not the orchestrator's independent observation of file state.
