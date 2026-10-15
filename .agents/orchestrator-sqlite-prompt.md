# IMPLEMENT A DURABLE LOCAL MULTI-AGENT CONTROL SYSTEM

## 1. Mission and writing rules

You are the implementation lead for an existing local agent system.
You already operate Claude, Codex, AGY, and their subagents.

Inspect the current system. Then implement this specification.
Reuse working integrations. Remove obsolete control paths.
Deliver working code, migrations, tests, and operating instructions.
Do not stop after an architecture report.

Use English for technical instructions and identifiers.
Use short sentences, active voice, and one term for each concept.
Use numbered procedures. Put one action in each procedure step.
Define technical terms before use.
Follow ASD-STE100 writing principles where practical.
Do not claim certified ASD-STE100 compliance without a formal check.
Use Portuguese for the final user report.

Prefer simple modules and explicit functions.
Do not add a framework when existing tools can satisfy the requirement.
Do not add a paid API dependency without user authorization.

## 2. Required outcome

Use SQLite as the authoritative source for orchestration state.
Use ordinary local processes for supervision, scheduling, and delivery.
Do not use an LLM to poll time, check heartbeats, or route routine events.
The control system must work when all LLM sessions are stopped.

Store tasks, messages, handoffs, schedules, usage samples, and leadership in SQLite.
Use Markdown only for documentation or an optional exported handoff.
Do not maintain parallel authoritative task lists in Markdown.

Keep terminal integration only where the installed CLI requires it.
Do not remove tmux if an active integration still depends on it.
Prefer supported structured CLI interfaces when available.
Use each provider through a separate adapter.

Scope: one host, one user, and local storage.
Do not introduce distributed infrastructure for this scope.

## 3. Audit the existing system before changes

Inspect the repository and the current runtime.
Read applicable repository instructions.
Inspect scripts, hooks, agent prompts, skills, queues, timers, and session launchers.
Inspect tmux integration, subprocess handling, logging, and recovery paths.
Inspect startup services and background processes.
Identify every source of repeated prompt content.

Build a dependency map.
Find duplicate schedulers, duplicate message channels, and conflicting ownership rules.
Identify instructions that execute on every turn or every session.
Measure their size. Use the installed tokenizer if available.
Otherwise report bytes and label token counts as estimates.

Create an audit table with these columns:

- Path or process.
- Current responsibility.
- Active callers.
- Decision: keep, modify, deprecate, or delete.
- Replacement.
- Evidence.
- Migration order.
- Rollback method.

Do not delete unrelated user files, credentials, logs, or unfinished work.
Do not erase the Git working tree.
Preserve the initial Git status.
Remove obsolete orchestration files after the replacement passes its checks.
Remove obsolete references, hooks, services, and prompt imports.
Do not leave two active schedulers during migration.
Keep the historical audit outside automatically loaded instructions.

## 4. Verify provider capabilities

Do not invent CLI flags, model identifiers, usage endpoints, or reset commands.
Inspect installed versions, help output, and available structured interfaces.
Use official documentation when local evidence is insufficient.
Record the source and verification date.

Verify these requested profiles:

- Claude: Sonnet, medium effort.
- Codex: Terra, medium effort.
- AGY: 3.8 reasoning, medium effort.

Treat these names as user profile labels until you verify actual identifiers.
Do not guess a replacement model.
Make unresolved mappings explicit configuration errors.

For each adapter, verify:

- Authentication method and account scope.
- Session creation and session termination.
- Input delivery during an active turn.
- Cooperative interruption and idle detection.
- Structured output and durable session identifiers.
- Usage information and reset information.
- Session resume behavior.
- Context information.
- Child process and native subagent visibility.
- Shared account limits across models and subagents.

Provide a capability matrix.
Use supported, unsupported, or unknown for each capability.
If status requires an interactive command, isolate terminal parsing in the adapter.
Test parsing against saved, sanitized fixtures.
Do not capture a complete terminal repeatedly in the LLM prompt.
Do not inspect or export authentication secrets.

A missing capability must produce a visible degraded state.
Do not describe an unverified integration as complete.

## 5. Separate context from usage quota

Context remaining is session capacity.
Quota remaining is provider usage capacity.
A new session can restore context capacity.
A new session does not restore account quota.

Track each provider quota window separately.
Examples include short windows, weekly windows, and model-specific windows.
Record quota scope: account, provider, model, or another verified scope.
Associate native subagents with the quota scopes they consume.

Normalize each sample with:

- Provider and profile.
- Quota scope identifier.
- Window identifier.
- Remaining percentage, or null.
- Reset timestamp, or null.
- Observation timestamp.
- Source.
- Confidence: verified, estimated, or unknown.
- Source reference or sanitized evidence reference.

Use remaining percentages from 0 to 100.
Do not confuse consumed percentage with remaining percentage.
Do not estimate precise quota from terminal text length.

Define effective quota as the minimum remaining percentage across binding quota windows.
An exhausted shared account scope blocks all affected sessions.
Do not select a different model to bypass an exhausted shared scope.

Use context remaining as a separate constraint.
Unknown usage is not 100 percent.
Stale usage is not valid evidence for leadership selection.

## 6. Thresholds and selection policy

Use these defaults:

- Warning threshold: 15 percent remaining.
- Stop threshold: 10 percent remaining.
- Successor admission threshold: strictly more than 20 percent remaining.
- Reactivation delay: 60 seconds after a verified reset timestamp.
- Usage freshness: 120 seconds.
- Heartbeat interval: 5 seconds.
- Heartbeat expiry: 30 seconds.
- Leadership lease: 30 seconds.
- Lease renewal: 5 seconds.
- Cooperative drain timeout: 120 seconds.
- Control message acknowledgement timeout: 15 seconds.
- Scheduler maximum idle wait: 5 seconds.

Make defaults configurable.
Validate incompatible timeout values at startup.
Use monotonic time for local elapsed durations.
Persist scheduled deadlines as UTC timestamps.

At 15 percent, persist a compact checkpoint.
At or below 10 percent, stop new task work.
Enter draining state and write the final handoff.
Use remaining capacity for handoff only.
Then block dispatch to the affected quota scope until verified recovery.

At or below 10 percent context remaining, rotate the session.
Do not mark account quota exhausted for a context-only event.
The same provider may receive a fresh session if quota eligibility permits.

Select a successor from healthy, authenticated, compatible profiles.
Require fresh quota evidence and effective quota above 20 percent.
Select the candidate with the highest effective quota.
For equal values, use this order:

1. Claude Sonnet.
2. Codex Terra.
3. AGY 3.8 reasoning.

This specification resolves the selection ambiguity as follows:

- Highest available quota controls emergency succession.
- Provider order resolves ties.
- Return to Claude after verified recovery is an explicit exception.

Do not rank incomparable measurements as if they were equivalent.
If a provider cannot expose reliable quota, mark automatic selection unsupported.
Provide an explicit manual configuration path for that provider.
Do not silently change the automatic policy.

## 7. SQLite infrastructure

Use the existing runtime when practical.
Choose one maintained SQLite driver that fits that runtime.
Explain the choice briefly.

Use a local filesystem that supports SQLite locking.
Do not put the active database on a network filesystem.
For WSL, prefer the Linux filesystem for the active database.

Enable foreign keys on every connection.
Use WAL mode and a bounded busy timeout.
Use FULL synchronous mode by default for control-state durability.
Keep write transactions short.
Never wait for a model or subprocess inside a database transaction.
Use parameterized SQL.
Retry lock contention with bounded backoff and jitter.

Implement versioned migrations.
Apply each migration transactionally where supported.
Check the supported SQLite version before using version-specific features.
Do not silently reset the database when a migration fails.

Implement these logical tables. Combine tables only when integrity remains clear:

- schema_migrations: version and applied timestamp.
- providers and profiles: verified configuration and priority.
- quota_scopes and quota_windows: shared limits and reset state.
- agents: identity, profile, parent, role, state, and heartbeat.
- sessions: runtime identity, process identity, lifecycle, and context state.
- tasks: state, owner, priority, dependencies, attempt, and lease.
- task_events: durable task transitions.
- messages: sender, recipient, type, payload, correlation, and expiry.
- deliveries: recipient delivery state, attempts, and acknowledgement.
- usage_samples: normalized observations and source confidence.
- handoffs: versioned content, checksum, source, target, and acceptance.
- leadership: singleton row, owner, epoch, lease, and transfer state.
- scheduled_jobs: due time, type, state, attempt, and deduplication key.
- outbox: committed events pending transport.
- runtime_events: structured operational evidence.

Add foreign keys, unique constraints, indexes, and state checks.
Index due jobs, undelivered messages, active task leases, and recent usage.
Enforce one leadership record.
Enforce idempotency keys for schedule creation and control commands.

Claim tasks and jobs atomically.
Use a short write transaction and conditional updates.
Validate affected row counts.
Recover expired claims without duplicate ownership.

Use at-least-once delivery with idempotent consumers.
Do not promise exactly-once execution across SQLite and external processes.
Persist intended actions before external effects.
Reconcile uncertain outcomes through stable operation identifiers.

Implement online backups with a supported SQLite backup method.
Do not copy only the main database while WAL writes are active.
Test backup restoration.
Add retention for verbose logs and old samples.
Preserve unresolved tasks and unaccepted handoffs.
Run integrity checks and disk-space checks.
On write failure or disk exhaustion, stop new work and report the failure.

Do not commit the runtime database, WAL files, credentials, or private logs.
Keep migrations, configuration examples, and tests in version control.
Provide explicit initialization, migration, backup, restore, and repair procedures.

## 8. Process architecture and watchers

Implement a supervisor independent of every agent session.
Use the host's existing process manager when practical.
Provide start, stop, restart, status, and health commands.
Prevent duplicate supervisor instances.
Handle SIGINT and SIGTERM.
Recover persisted work after restart.

Watchers are ordinary functions or tasks inside the supervisor.
Do not create one daemon for each watcher without a technical need.

Implement these watchers:

1. Usage watcher: collect usage and context observations.
2. Session watcher: detect exit, idle state, and missing heartbeat.
3. Queue watcher: claim and deliver durable messages.
4. Schedule watcher: execute due jobs and reconcile missed deadlines.
5. Leadership watcher: renew leases and initiate recovery.
6. Recovery watcher: reconcile orphaned processes, tasks, and transfers.

Use events or structured streams when available.
Use bounded polling only as fallback.
Add backoff, jitter, cancellation, and error isolation.
Do not launch an LLM request for a routine watcher cycle.
Cache usage observations within their freshness period.
Ensure status probes do not alter active task input unexpectedly.

Give control messages priority over new tasks.
Wake the delivery loop when control events arrive.
Use a durable cursor and acknowledgement state.
Do not rely on filesystem notifications as the only source of truth.

On restart, reconcile overdue jobs.
Do not send duplicate prompts for the same transition.
Cap retries and move permanent failures to an inspectable failed state.

## 9. Programmatic delivery and helpers

Implement real functions and a small local CLI.
Do not provide pseudocode as the final implementation.
Names below define responsibilities. Adapt naming to the repository style.

Provider adapter:

- inspectCapabilities()
- startSession(profile, bootstrap, operationId)
- sendMessage(sessionId, message, operationId)
- requestDrain(sessionId, reason, deadline)
- readUsage(profile)
- readContext(sessionId)
- readResetWindows(profile)
- isAlive(sessionId)
- stopSession(sessionId, mode)
- reconcileSession(operationId)

Persistence and queue:

- initializeDatabase()
- applyMigrations()
- enqueueMessage()
- claimDelivery()
- acknowledgeDelivery()
- scheduleJob()
- claimDueJobs()
- completeJob()
- appendEvent()
- backupDatabase()
- restoreDatabase()

Task and usage control:

- registerAgent()
- heartbeat()
- claimTask()
- checkpointTask()
- releaseTask()
- normalizeUsage()
- computeEffectiveQuota()
- isEligible()
- blockQuotaScope()
- scheduleQuotaRecheck()
- selectSuccessor()

Leadership and handoff:

- createHandoff()
- validateHandoff()
- requestLeadershipTransfer()
- acquireLeadership()
- renewLeadership()
- assertLeadershipEpoch()
- acknowledgeHandoff()
- completeLeadershipTransfer()
- enterGlobalDrain()
- recoverAfterCrash()

Use typed payloads or equivalent runtime validation.
Return structured errors.
Attach correlation IDs to every transfer.
Use argument arrays for subprocess commands.
Do not build shell commands from untrusted text.
Validate repository paths and process ownership.

Expose CLI operations for:

- init, migrate, doctor, start, stop, and status.
- usage refresh and usage inspection.
- queue inspection and failed-job retry.
- agent registration and session inspection.
- task checkpoint and handoff submission.
- transfer request and global drain.
- backup and restore.

Document exact installed command syntax after implementation.
Do not invent provider command examples before capability verification.

## 10. Handoff contract

A handoff is a durable recovery record.
Store its authoritative content in SQLite.
Use versioned JSON or another validated structured format.
Allow Markdown export for human review.

Include:

- Handoff ID, schema version, timestamp, and reason.
- Source agent, session, profile, and leadership epoch.
- Project objective and acceptance criteria.
- Current task IDs and their states.
- Completed work and evidence.
- Pending work in execution order.
- Decisions, constraints, and rejected options that still matter.
- Modified files and their purpose.
- Repository path, branch, worktree, and current commit.
- Uncommitted change summary and durable patch reference when needed.
- Running processes and verified runtime identifiers.
- Commands already started and their known outcomes.
- Tests run, exact results, and unresolved failures.
- Owned resources, task leases, and locks.
- Known risks and blocked dependencies.
- Next concrete action.
- Relevant artifact references.
- Usage state and pending reset jobs.
- Recipient acknowledgement state.

Keep the bootstrap summary compact.
Default to at most 1,500 tokens for the summary.
Store larger evidence by reference.
Do not paste full transcripts into the next session.
Do not remove essential recovery data to satisfy a summary budget.

Create checkpoints at task boundaries.
Update them after important file changes or long-running command launches.
At 10 percent, complete the final handoff from the latest checkpoint.
If the provider blocks first, synthesize a recovery handoff from durable evidence.
Label recovered information and uncertainty.

Do not require an automatic commit for each handoff.
Preserve uncommitted work.
Do not reset, stash, or delete changes without a justified safe procedure.

## 11. Leadership transfer protocol

Only one session may dispatch project work.
Use a renewable lease and a monotonically increasing leadership epoch.
An epoch is the fencing token for leadership actions.

Use these transfer states:
requested, draining, handoff_ready, successor_starting, successor_ready,
committed, failed, and recovery_required.

Perform this sequence:

1. Persist a transfer request with a unique operation ID.
2. Stop new dispatch from the current leader.
3. Send a priority drain instruction to the current leader.
4. Quiesce its current actions at a safe boundary.
5. Persist and validate its handoff.
6. Select an eligible successor.
7. Start a fresh successor session in standby mode.
8. Deliver the handoff and compact bootstrap.
9. Require a validated readiness acknowledgement.
10. Verify that the old leader has stopped project mutations.
11. Atomically assign leadership and increment the epoch.
12. Enable dispatch for the successor.
13. Terminate the old leader session.
14. Persist completion.

The successor must not dispatch while in standby.
Every dispatch must validate the active owner, epoch, and lease.
Reject stale epochs.

Fencing a queue does not stop a model that can edit files directly.
Implement process-level quiescence or isolation for direct mutations.
Do not activate the successor while the previous leader can still mutate shared resources.
Manage child processes as well as the parent session.
Verify process identity before signals.
Do not kill unrelated user processes or tmux sessions.

Workers may continue leased tasks during a normal transfer.
The successor must adopt and reconcile those tasks.
Pause a worker when its work overlaps the leader's mutable resources.
Use explicit resource ownership or isolated worktrees to prevent concurrent file edits.

If the successor fails before commit, keep it in standby.
Resume the old leader only if its quota, lease, and session remain eligible.
Otherwise select another successor or enter global drain.
Do not repeatedly start failed successors without a retry limit.

Recover crashes at every transfer boundary.
A stale leader must lose authority after lease expiry.
A new supervisor must reconcile an existing successor before starting another one.

## 12. Reset scheduling and return to Claude

When a quota scope reaches the stop threshold:

1. Persist the latest usage evidence.
2. Drain affected sessions.
3. Block new dispatch for that quota scope.
4. Read the verified reset timestamp.
5. Persist a quota_recheck job for reset timestamp plus 60 seconds.

Do not schedule a real ChatGPT reminder for this implementation.
Implement the scheduler inside the local system.

For multiple binding windows, check every blocking window.
Do not reactivate while any binding window remains blocked.
If reset time is unknown, use bounded status rechecks.
Do not invent a reset time.

When the job runs, refresh actual quota.
A timestamp alone does not prove quota recovery.
If quota is still insufficient, keep the scope blocked.
Reschedule with bounded backoff.
If the reported reset time changes, replace or supersede the old job idempotently.

Reactivate workers only when effective quota is above 20 percent.
Require valid fresh evidence.
Persist the reactivation result.

If recovered Claude is eligible, request a return-to-Claude transfer.
This rule overrides the normal highest-quota ranking.
Send the current orchestrator a programmatic handoff instruction.
Start a fresh Claude session through the transfer protocol.
Pass the durable handoff after the new session is ready to receive input.
Terminate the previous orchestrator after the leadership commit.
Do not interrupt a healthy Claude leader to create another Claude leader.

If no leader is active, the supervisor may start eligible Claude directly.
If Claude fails readiness, keep the current eligible leader.
Record the failure and retry with a bounded policy.
Do not enter a loop of session creation.

## 13. Global drain when no successor is eligible

When leadership must change, check all eligible candidates.
If none has more than 20 percent, enter global draining state.

Send a durable priority HANDOFF_AND_STOP message to every active agent.
Include native subagents through their parent adapter when required.
Stop all new task dispatch.
Ask each agent to checkpoint work and submit a final handoff.
Require acknowledgements and track missing responses.

Allow only checkpoint and shutdown work during draining.
Do not start replacement LLM sessions.

At the drain deadline:

- Reconcile agent state and process state.
- Preserve worktrees and partial artifacts.
- Mark interrupted tasks explicitly.
- Recover task leases.
- Record agents that could not acknowledge.
- Terminate only verified owned processes that cannot drain safely.

Enter paused_no_capacity after reconciliation.
Keep the supervisor, queue, and scheduler alive.
Notify the user through the existing local status channel.
Do not add an external notification service.

When capacity returns, verify eligibility again.
Prefer recovered Claude for automatic restart.
Otherwise select the highest-quota eligible candidate.
Load all pending handoffs.
Reconcile task ownership before dispatch resumes.

The target is no undocumented abandoned work.
Do not claim a crashed agent completed a handoff it never wrote.

## 14. Control message contracts

Use versioned messages with:
message_id, type, sender_id, recipient_id, operation_id, correlation_id,
leadership_epoch, created_at, expires_at, and payload.

Implement at least:

- TASK_ASSIGN.
- CHECKPOINT_REQUEST.
- DRAIN_REQUEST.
- HANDOFF_READY.
- HANDOFF_ACCEPTED.
- SUCCESSOR_READY.
- LEADERSHIP_GRANTED.
- QUOTA_BLOCKED.
- QUOTA_RECHECK.
- QUOTA_RECOVERED.
- RETURN_TO_CLAUDE.
- HANDOFF_AND_STOP.
- SESSION_STOPPED.

Transport acknowledgement is not task completion.
Distinguish delivery, receipt, readiness, and completion.
Reject invalid recipients and stale control commands.
Expire obsolete transfer commands.
Give each state transition an idempotency key.

Supply short bootstrap and control prompt templates.
Each template must state the required action and acknowledgement command.
Do not rely on an agent remembering an earlier chat instruction.

## 15. Reduce token consumption

Keep automatically loaded instructions small.
Separate shared rules from provider adapter instructions.
Load task-specific instructions only when required.
Use database IDs and targeted reads instead of full history.
Use bounded pagination for messages and events.
Summarize completed work once.
Do not inject unchanged logs into each turn.

Keep detailed architecture and historical audit outside startup prompts.
Remove duplicate copies of the same policy.
Keep one canonical policy configuration.
Generate small agent instructions from that configuration when useful.
Keep obsolete instructions out of active discovery paths.

Report before-and-after bytes for automatic instruction bundles.
Report measured or estimated tokens with the method.
Do not claim a specific cost saving without evidence.

## 16. Migration and rollback

Implement in small verifiable stages:

1. Audit and capability verification.
2. Database and durable queue.
3. Adapters and lifecycle control.
4. Watchers and reset scheduling.
5. Leadership transfer and global drain.
6. Instruction cleanup and legacy removal.
7. Recovery tests and operating documentation.

Run initial integration checks in an isolated workspace.
Do not cause a real quota exhaustion for a test.
Use an injectable clock and fake provider adapters.

Back up existing orchestration configuration.
Record how to disable the new supervisor.
Provide a reversible cutover procedure.
Stop the old scheduler before enabling the new scheduler.
Verify a single active control path.
Delete obsolete tracked files only after replacement verification.
Keep the rollback reference in Git or a separate backup.

## 17. Required verification

Test these cases with deterministic fixtures:

1. Concurrent workers claim one task only once.
2. A duplicate message does not repeat an action.
3. A crash after delivery but before acknowledgement recovers safely.
4. A job survives supervisor restart.
5. An overdue reset job runs after restart.
6. A reset timestamp changes.
7. A reset time arrives but quota remains blocked.
8. One quota window resets while another remains exhausted.
9. Shared subagent usage blocks the correct account scope.
10. Unknown or stale usage does not become valid quota.
11. Context depletion creates a fresh eligible session.
12. Account depletion does not trigger a quota-bypass session.
13. A threshold crossing creates one drain request.
14. A 10-percent sample blocks new work.
15. Exactly 20 percent does not qualify a successor.
16. Highest eligible quota wins emergency succession.
17. The specified provider order resolves a tie.
18. Recovered Claude receives leadership through a fresh session.
19. A successor cannot dispatch before transfer commit.
20. A stale epoch cannot dispatch.
21. An old leader with direct file access is quiesced before activation.
22. A successor fails before readiness.
23. The supervisor crashes during each transfer state.
24. No eligible successor causes global drain.
25. An unresponsive agent leaves recoverable work evidence.
26. SQLite contention triggers bounded retries.
27. Disk exhaustion stops dispatch.
28. Backup restoration preserves task and handoff relationships.
29. Graceful shutdown preserves queue and scheduling state.
30. Removed legacy instructions have no active references.

Add adapter contract tests.
Add a local end-to-end simulation with fake providers.
Run verified real-provider smoke checks only when they are safe and available.
Separate simulated results from real integration results.

## 18. Completion requirements

Deliver:

- Audit and capability matrix.
- Architecture and explicit policy decisions.
- Working source files and provider adapters.
- Versioned SQLite migrations.
- Configuration example without secrets.
- CLI and supervisor startup instructions.
- Implemented helpers and control prompt templates.
- Tests and exact execution results.
- Backup, restore, migration, and rollback procedures.
- Before-and-after instruction size report.
- List of removed and deprecated files.
- Known unsupported capabilities and their operational effect.

Do not mark the implementation complete if a required real integration is unverified.
State what works automatically and what requires manual input.
Do not replace missing functionality with a silent no-op.
Keep the final explanation concise.

Start with the existing-system audit.
Then implement the smallest reliable design that satisfies these requirements.
