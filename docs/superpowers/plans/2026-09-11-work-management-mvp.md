# EmmyTech Work Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure internal Todo + Task + Goal system that appears on the EmmyTech Command Centre and gives staff private Todos, negotiated delegated Tasks, Goals, team visibility for Administration, and in-app notifications.

**Architecture:** Add a dedicated `work_*` PostgreSQL domain with RLS and narrow Security Definer lifecycle RPCs. Keep personal Todos private even from Admin sessions, expose only involved/shared work, and integrate the resulting work summary into the existing Command Centre plus a new `/modules/activities` My Work workspace. Use the existing internal-user/RBAC foundation and notification pattern instead of creating a parallel identity system.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Supabase JS 2.106.2, Supabase SSR 0.10.3, PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-11-work-management-design.md`

## Global Constraints

- Internal EmmyTech staff only; Ambassadors do not participate.
- Todos are private to their owner and remain private from Admin/Super Admin ordinary sessions.
- Tasks require explicit acceptance before accountability begins.
- Every delegated Task requires requested start and due date/time.
- Pending acceptance / extension pending / returned Tasks cannot count as overdue.
- Any internal staff member may delegate to any other internal staff member.
- Only `admin` and `super_admin` may assign to Everyone or create/manage company Goals.
- Recipients cannot directly change agreed deadlines; deadline changes require an extension request.
- Approved pre-acceptance extension activates the Task immediately.
- Rejection requires reason + explanation and returns the Task to the assigner.
- Completion requires a completion note; MVP does not require completion approval.
- Task history is append-only and immutable through the ordinary application.
- Do not build Kanban, projects, sprints, dependencies, recurring Tasks, attachments, chat/comments, employee scoring, or external notification channels in this MVP.
- Preserve all existing CRM, Marketing, Sales, Operations, staff RBAC, and Ambassador flows.

---

### Task 1: Work domain types and lifecycle tests

**Files:**
- Create: `src/lib/work/types.ts`
- Create: `src/lib/work/domain.ts`
- Create: `src/lib/work/domain.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `WorkPriority`, `TaskAssignmentStatus`, `GoalVisibility`, `GoalProgressMode`, `RejectionReasonCode`.
- Produces pure helpers `isOverdueAssignment()`, `isDueSoonAssignment()`, `canShowTodoToUser()`, `canReadTask()`, `canManageCompanyGoal()` used by UI/server tests.

- [ ] **Step 1: Write failing lifecycle tests**

Cover:
- pending acceptance is never overdue;
- active + past agreed deadline is overdue;
- active + next-24-hours is due soon;
- completed is not overdue;
- private Todo visible only to owner;
- company Goal management only for `admin`/`super_admin`.

- [ ] **Step 2: Run isolated tests and verify RED**

```bash
node --experimental-strip-types --test src/lib/work/domain.test.ts
```

Expected: FAIL because implementation files are not complete.

- [ ] **Step 3: Implement minimal pure domain helpers**

Keep the domain layer free of Supabase/React dependencies.

- [ ] **Step 4: Verify GREEN**

```bash
node --experimental-strip-types --test src/lib/work/domain.test.ts
```

- [ ] **Step 5: Add `test:work` package script**

```json
"test:work": "node --experimental-strip-types --test src/lib/work/*.test.ts"
```

---

### Task 2: PostgreSQL work-management foundation

**Files:**
- Create: `supabase/migrations/20260911113000_work_management_foundation.sql`
- Create: `src/lib/work/database-contract.test.ts`

**Interfaces:**
- Produces tables:
  - `work_todos`
  - `work_tasks`
  - `work_task_assignments`
  - `work_task_extension_requests`
  - `work_task_events`
  - `work_goals`
  - `work_goal_contributors`
- Produces RLS helper functions for internal-role and work visibility checks.

- [ ] **Step 1: Write failing database contract test**

Assert migration text contains all seven tables, RLS enabled on each, and constraints for valid priority/status/visibility/progress/rejection values.

- [ ] **Step 2: Verify RED**

```bash
node --experimental-strip-types --test src/lib/work/database-contract.test.ts
```

- [ ] **Step 3: Create tables and constraints**

Use UUID PKs with `gen_random_uuid()`, `timestamptz`, FK references to `public.users(id)`, and explicit check constraints.

Required Todo rules:
```sql
owner_id uuid not null references public.users(id)
status text check (status in ('open','completed','cancelled'))
priority text check (priority in ('low','normal','high','urgent'))
```

Required Assignment status:
```sql
check (status in ('pending_acceptance','extension_pending','active','returned','completed','cancelled'))
```

Required Goal visibility/progress:
```sql
visibility in ('personal','shared','company')
progress_mode in ('numeric','tasks')
```

- [ ] **Step 4: Add RLS policies**

Mandatory behavior:
- `work_todos`: `auth.uid() = owner_id` only for all CRUD.
- `work_tasks`: readable by creator, assignment participants, Admin/Super Admin.
- `work_task_assignments`: readable by task creator, assignee, Admin/Super Admin.
- `work_task_extension_requests`: readable by assignee, task creator, Admin/Super Admin.
- `work_task_events`: readable when parent Task is readable; no direct client INSERT/UPDATE/DELETE.
- `work_goals`: personal owner only; shared owner/contributors/Admin; company all internal staff.
- `work_goal_contributors`: visibility follows Goal; mutations restricted to Goal owner/Admin as appropriate.

- [ ] **Step 5: Apply migration to EmmyTech Supabase**

Use `Supabase.apply_migration`, then inspect `pg_policies`, constraints and grants.

- [ ] **Step 6: Verify database contract GREEN**

---

### Task 3: Narrow Task lifecycle RPCs

**Files:**
- Create: `supabase/migrations/20260911114500_work_task_lifecycle_rpcs.sql`
- Create: `src/lib/work/lifecycle-contract.test.ts`

**Interfaces:**
- Produces:
  - `work_create_task(...) returns uuid`
  - `work_create_broadcast_task(...) returns uuid`
  - `work_accept_task(uuid) returns void`
  - `work_reject_task(uuid,text,text) returns void`
  - `work_request_extension(uuid,timestamptz,text) returns uuid`
  - `work_decide_extension(uuid,text,text) returns void`
  - `work_complete_task(uuid,text) returns void`
  - `work_reassign_returned_task(uuid,uuid,timestamptz,timestamptz,text,text) returns uuid`
  - `work_cancel_assignment(uuid,text) returns void`

- [ ] **Step 1: Write failing lifecycle contract tests**

Assert every lifecycle function uses `auth.uid()` and never trusts a caller-supplied actor ID.

Assert broadcast checks for `admin`/`super_admin`.

Assert extension decision allows only task creator/assigner/Admin/Super Admin.

Assert completion requires non-empty completion note.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement private event writer**

Create a helper such as:
```sql
work_append_task_event(p_task_id uuid, p_assignment_id uuid, p_event_type text, p_metadata jsonb)
```

Revoke execute from `anon` and ordinary `authenticated`; call only from lifecycle Security Definer functions.

- [ ] **Step 4: Implement Task creation and assignment**

`work_create_task`:
- validate current actor is internal staff;
- validate assignee is internal staff and not Ambassador;
- require due > start;
- insert Task;
- insert `pending_acceptance` assignment;
- append history.

`work_create_broadcast_task`:
- require Admin/Super Admin;
- insert one parent Task;
- add one assignment for every eligible internal user except explicitly excluded IDs if supported;
- append assignment events.

- [ ] **Step 5: Implement accept/reject**

Accept only when current user owns assignment and status is `pending_acceptance`.

Reject requires valid reason code and non-empty explanation; set status `returned` and append event.

- [ ] **Step 6: Implement extension negotiation**

Request:
- current user must own assignment;
- proposed deadline > current requested/agreed deadline;
- assignment becomes `extension_pending` only when pre-acceptance; active assignment remains active with pending request record.

Decision:
- creator/assigner/Admin decides;
- approval updates `agreed_due_at`;
- approval of pre-acceptance extension sets assignment `active` and `accepted_at`;
- decline of pre-acceptance extension returns to `pending_acceptance`;
- decline of active extension leaves assignment active and original agreed due date unchanged.

- [ ] **Step 7: Implement completion/reassign/cancel**

Completion:
- assignee only;
- active only;
- non-empty note;
- records completion event.

Reassign:
- only returned assignment;
- creator/Admin only;
- old assignment remains immutable in history;
- create new pending assignment.

Cancel:
- creator/Admin only;
- open assignment only;
- preserve history.

- [ ] **Step 8: Apply migration and inspect function definitions**

- [ ] **Step 9: Verify lifecycle contract GREEN**

---

### Task 4: Goal management RPCs and task-based progress

**Files:**
- Create: `supabase/migrations/20260911120000_work_goals.sql`
- Create: `src/lib/work/goals-contract.test.ts`

**Interfaces:**
- Produces RPCs/views for creating/updating Goals and a queryable progress calculation.

- [ ] **Step 1: Write failing Goal contract tests**

Require:
- personal/shared Goal creation for internal staff;
- company Goal creation limited to Admin/Super Admin;
- contributor management by owner/Admin;
- numeric Goal update authorization;
- task-based Goal progress derived from assignments rather than manually trusted percentage.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement Goal RPCs**

Recommended:
```sql
work_create_goal(...)
work_update_goal(...)
work_set_goal_contributors(...)
work_update_numeric_goal_progress(...)
```

- [ ] **Step 4: Implement safe progress view/function**

For `tasks` mode, count linked visible Task assignments and completed assignments.

Do not expose another user's private Todo merely because it references the Goal.

- [ ] **Step 5: Apply migration and verify GREEN**

---

### Task 5: Server data layer

**Files:**
- Create: `src/lib/work/server.ts`
- Create: `src/lib/work/server-contract.test.ts`

**Interfaces:**
- Produces:
  - `getMyWorkDashboard()`
  - `getMyTodos()`
  - `getMyTasks()`
  - `getTaskDetail(taskId)`
  - `getMyGoals()`
  - `getTeamWorkSummary()`
  - `listAssignableStaff()`

- [ ] **Step 1: Write failing server contract tests**

Assert server functions call `requireInternalUser()` and never use service-role access to bypass Todo privacy.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement current-user work summary**

Return:
```ts
{
  pendingAcceptanceCount,
  extensionDecisionCount,
  dueTodayCount,
  overdueCount,
  todayTodoCount,
  nextTask,
  goalHighlight,
}
```

- [ ] **Step 4: Implement Task/Goal loaders**

Use authenticated Supabase server client so RLS remains active.

- [ ] **Step 5: Implement Admin Team summary**

Only `admin`/`super_admin` may load aggregate Task/Goal metrics.

Never query `work_todos` for other users.

- [ ] **Step 6: Verify GREEN**

---

### Task 6: Server actions for Todo and lifecycle commands

**Files:**
- Create: `src/app/modules/activities/actions.ts`
- Create: `src/lib/work/actions-contract.test.ts`

**Interfaces:**
- Produces form/server actions for Todo CRUD and RPC wrappers for Task/Goal transitions.

- [ ] **Step 1: Write failing action contract tests**

Require `revalidatePath('/modules/activities')` and dashboard revalidation after mutations.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement Todo CRUD**

Todo create/update/delete/complete uses authenticated client with RLS; no service-role client.

- [ ] **Step 4: Implement Task lifecycle wrappers**

Wrap the lifecycle RPCs and normalize errors for UI.

- [ ] **Step 5: Implement Goal wrappers**

- [ ] **Step 6: Verify GREEN**

---

### Task 7: My Work workspace shell

**Files:**
- Create: `src/app/modules/activities/page.tsx`
- Create: `src/components/work/workspace.tsx`
- Create: `src/components/work/workspace.module.css`
- Create: `src/lib/work/workspace-contract.test.ts`
- Modify: `src/components/os/ambassador-style-dashboard.tsx`

**Interfaces:**
- Replaces generic `/modules/activities` placeholder with real workspace.
- Sidebar label changes from `My Tasks` to `My Work`.

- [ ] **Step 1: Write failing workspace contract tests**

Require:
- static `/modules/activities/page.tsx`;
- server internal-user guard;
- tabs `Today`, `Tasks`, `Todo`, `Goals`;
- `Team` rendered only for Admin/Super Admin;
- dashboard sidebar links to `/modules/activities` as `My Work`.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement server page**

Load current-user work data and pass only permitted records to client workspace.

- [ ] **Step 4: Implement tab shell and responsive structure**

Keep the visual language aligned with EmmyTech Command Centre rather than introducing a third-party project-management look.

- [ ] **Step 5: Verify GREEN**

---

### Task 8: Todo experience

**Files:**
- Create: `src/components/work/todo-panel.tsx`
- Create: `src/components/work/todo-form.tsx`
- Create: `src/components/work/delegate-todo-dialog.tsx`
- Modify: `src/components/work/workspace.tsx`

**Interfaces:**
- Consumes Todo actions and `listAssignableStaff()` results.

- [ ] **Step 1: Write UI contract test for Todo controls**

Require quick-add title, optional schedule/deadline, priority, optional Goal, edit/reschedule/complete/delete/delegate actions.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement quick capture and Todo groups**

Group open Todos into Today / Tomorrow / Later / No Date where useful.

- [ ] **Step 4: Implement Delegate as Task**

Mandatory fields:
- assignee;
- requested start;
- requested due;
- priority;
- instructions.

Optional Goal defaults from source Todo when linked.

- [ ] **Step 5: Ensure delegation does not complete source Todo**

- [ ] **Step 6: Verify GREEN**

---

### Task 9: Task list, detail and negotiation UI

**Files:**
- Create: `src/components/work/task-list.tsx`
- Create: `src/components/work/task-detail.tsx`
- Create: `src/components/work/task-response-dialog.tsx`
- Create: `src/components/work/extension-dialog.tsx`
- Create: `src/components/work/task-history.tsx`
- Modify: `src/components/work/workspace.tsx`

**Interfaces:**
- Consumes Task lifecycle server actions.

- [ ] **Step 1: Write failing UI contract tests**

Require filters:
- Assigned to me;
- Assigned by me;
- Needs response;
- Active;
- Completed;
- Returned.

Require recipient controls:
- Accept;
- Request More Time;
- Reject.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement Task cards and filters**

Show priority, status, person, requested/agreed deadline, Goal.

- [ ] **Step 4: Implement pending-acceptance actions**

Reject requires category + explanation.

- [ ] **Step 5: Implement extension request/decision UI**

Assigner view shows original and proposed deadline with Approve/Decline controls.

- [ ] **Step 6: Implement active completion flow**

Require completion note.

- [ ] **Step 7: Implement immutable history timeline**

- [ ] **Step 8: Verify GREEN**

---

### Task 10: Goals UI

**Files:**
- Create: `src/components/work/goals-panel.tsx`
- Create: `src/components/work/goal-form.tsx`
- Create: `src/components/work/goal-detail.tsx`
- Modify: `src/components/work/workspace.tsx`

**Interfaces:**
- Consumes Goal server actions/loaders.

- [ ] **Step 1: Write failing Goal UI contract tests**

Require Company / Shared / Personal groupings and numeric/task-based progress.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement Goal creation**

Normal staff can create personal/shared. Admin/Super Admin additionally can create company Goals.

- [ ] **Step 4: Implement progress cards and detail**

Task-based progress updates from linked Task completion data.

- [ ] **Step 5: Confirm private Todo information is never rendered for other Goal viewers**

- [ ] **Step 6: Verify GREEN**

---

### Task 11: Team management view

**Files:**
- Create: `src/components/work/team-work-panel.tsx`
- Modify: `src/components/work/workspace.tsx`

**Interfaces:**
- Consumes `getTeamWorkSummary()`.

- [ ] **Step 1: Write failing admin visibility test**

Require Team tab only for `admin`/`super_admin`.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement aggregate management view**

Show per-person company/shared Task metrics:
- pending acceptance;
- active;
- due today;
- overdue;
- extension requests.

- [ ] **Step 4: Add broadcast Task creation**

Admin/Super Admin only.

- [ ] **Step 5: Verify no Todo data is queried or rendered**

- [ ] **Step 6: Verify GREEN**

---

### Task 12: Command Centre Today panel and work-aware header

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/os/ambassador-style-dashboard.tsx`
- Modify: `src/components/os/ambassador-style-dashboard.module.css`
- Create: `src/components/work/dashboard-work-summary.tsx`
- Create: `src/lib/work/dashboard-contract.test.ts`

**Interfaces:**
- Consumes `getMyWorkDashboard()`.

- [ ] **Step 1: Write failing dashboard contract tests**

Require:
- greeting;
- needs-response count;
- due-today count;
- overdue count;
- next Task;
- quick Add Todo;
- `View My Work` link.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Load work summary in server home page**

- [ ] **Step 4: Render compact Today panel above workspace cards**

Urgency order:
1. Needs response;
2. Overdue;
3. Due today;
4. Today's Todo;
5. Upcoming.

- [ ] **Step 5: Keep clear-state copy calm when nothing needs attention**

- [ ] **Step 6: Verify GREEN**

---

### Task 13: In-app notifications

**Files:**
- Modify or integrate with: `src/components/notification-center.tsx`
- Create: `supabase/migrations/20260911121500_work_notifications.sql`
- Create: `src/lib/work/notification-contract.test.ts`

**Interfaces:**
- Uses existing EmmyTech notification UI/pattern where compatible.

- [ ] **Step 1: Inspect existing notification storage and read/update patterns**

Do not create a duplicate notification table if current schema can support internal staff notification types safely.

- [ ] **Step 2: Write failing notification contract tests**

Require events for assignment, acceptance, rejection, extension request/decision, due-soon/overdue where generated, completion, and Goal contributor addition.

- [ ] **Step 3: Implement notification integration**

Prefer writing notifications from lifecycle RPCs where transactional consistency matters.

- [ ] **Step 4: Surface unread work notifications in existing bell UI**

- [ ] **Step 5: Verify GREEN**

---

### Task 14: Due-state refresh and notification strategy

**Files:**
- Create: `src/lib/work/time.ts`
- Create: `src/lib/work/time.test.ts`
- Modify dashboard/work loaders as needed.

**Interfaces:**
- Produces deterministic due-state helpers.

- [ ] **Step 1: Write boundary tests for due-today/due-soon/overdue**

- [ ] **Step 2: Implement timestamp helpers**

Database stores `timestamptz`; UI formats in user/business timezone.

- [ ] **Step 3: Keep overdue as derived state**

Do not require a background job merely to mark records overdue.

- [ ] **Step 4: Decide due-soon notification generation for MVP**

If no safe scheduler is already present in EmmyTech OS, show due-soon/overdue dynamically in the UI and defer persistent scheduled notification rows. Do not add paid infrastructure solely for this feature.

- [ ] **Step 5: Verify GREEN**

---

### Task 15: Full regression, security and handoff verification

**Files:**
- No production changes unless verification finds a defect.

**Interfaces:**
- Verifies work management + existing staff RBAC + commercial regression together.

- [ ] **Step 1: Run Work tests**

```bash
npm run test:work
```

Expected: PASS.

- [ ] **Step 2: Run staff auth/RBAC tests**

```bash
npm run test:auth
```

Expected: PASS.

- [ ] **Step 3: Run existing Sales/Operations regression**

```bash
npm run test:commercial
```

Expected: PASS.

- [ ] **Step 4: Run changed-file lint and build**

```bash
npm run lint
npm run build
```

If full-repo lint still contains unrelated legacy debt, changed work-management files must be lint-clean and baseline debt must be reported separately.

- [ ] **Step 5: Database privacy smoke checks**

Using controlled test identities where practical, prove:
- User A cannot read User B Todo;
- Admin ordinary session cannot read User B Todo;
- unrelated User C cannot read A→B Task;
- B can accept A→B Task;
- C cannot accept B's assignment;
- B cannot overwrite agreed deadline directly;
- A/Admin can decide B's extension request;
- non-admin cannot create broadcast Task;
- non-admin cannot create company Goal;
- Task events cannot be edited/deleted by ordinary clients.

- [ ] **Step 6: Manual UX acceptance**

Test:
1. Add private Todo.
2. Delegate Todo to another staff user with timeframe.
3. Recipient requests extension before accepting.
4. Assigner approves; Task becomes active immediately.
5. Recipient completes with note.
6. Rejection returns another Task to assigner with explanation.
7. Admin broadcasts a Task and sees independent recipient statuses.
8. Personal/shared/company Goal visibility behaves correctly.
9. Command Centre Today panel reflects the current user only.
10. Team view excludes personal Todos.

- [ ] **Step 7: Compare branch against main**

Review every changed file and migration for unrelated edits, credentials, or broad service-role bypasses.

- [ ] **Step 8: Do not merge until user has tested and explicitly approves promotion to main**
