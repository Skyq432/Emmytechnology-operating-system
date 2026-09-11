# EmmyTech Work Management System Design

**Date:** 2026-09-11  
**Branch:** `feature/staff-rbac-mvp`  
**Status:** Approved design specification  
**Scope:** Internal EmmyTech staff only. Ambassadors are excluded from this subsystem.

## 1. Purpose

Build a lightweight work-management layer inside EmmyTech OS that helps a small internal team answer four questions immediately after login:

1. What do I need to do today?
2. What work has been assigned to me and do I accept it?
3. What work have I delegated to someone else and what is its status?
4. Which personal, shared, or company goal is this work contributing to?

The subsystem must remain substantially simpler than a full project-management product. It is not intended to reproduce Jira, Asana, Monday or ClickUp.

The approved model has three separate concepts:

- **Todo** = private personal work.
- **Task** = shared responsibility delegated from one staff member to another.
- **Goal** = an outcome that Todos and Tasks may support.

These concepts must remain distinct in both the database and user interface.

---

## 2. Product Principles

### 2.1 Private by default

Personal Todos are visible only to their owner. A Todo does not become company-visible merely because Emmanuel is Super Admin.

When a Todo is delegated as a Task, the Task becomes visible to the people involved in that Task and to authorised administration, but the original owner's unrelated private Todos remain private.

### 2.2 Delegation is a request, not automatic acceptance

A staff member can assign a Task to another internal staff member, but the Task is initially `pending_acceptance`.

The recipient must explicitly:

- accept it;
- request a different deadline; or
- reject it with a reason.

A Task must not be treated as active, late, or overdue against the recipient until responsibility has been accepted.

### 2.3 Every delegated Task has a timeframe

A delegated Task requires:

- requested start date/time;
- requested due date/time;
- priority;
- assigner;
- assignee.

A personal Todo may have an optional due date/time. The moment it is delegated as a Task, a due date/time becomes mandatory.

### 2.4 Rejection returns to the assigner

Rejected Tasks are never automatically reassigned.

A rejected Task returns to the person who assigned it. The assigner may:

- edit and resend it;
- reassign it to another staff member;
- cancel it.

The rejection reason and history must remain visible.

### 2.5 Deadlines cannot be silently changed by recipients

Recipients cannot directly overwrite an agreed due date.

They can request an extension with:

- proposed new due date/time;
- mandatory explanation.

The assigner or Super Admin/Admin may approve or decline the request.

If the recipient requests an extension before accepting the Task and the assigner approves it, the Task becomes active immediately. Approval is considered acceptance of the revised agreement; the recipient does not need to press Accept again.

If that extension request is declined, the Task returns to `pending_acceptance` under the original requested deadline so the recipient can accept it or reject it.

### 2.6 Accountability without unnecessary bureaucracy

Completing a Task requires a short completion note.

MVP does not require the assigner to approve completion. A Task becomes completed when the assignee marks it complete.

Task review/approval may be added later for selected workflows but is not part of the first version.

### 2.7 Any internal staff member may delegate to any other internal staff member

EmmyTech has a small team and cross-functional work is common. The system will not hard-code a management hierarchy for ordinary one-to-one assignment.

Any internal staff member may assign a Task to any other internal staff member.

The recipient can reject it as the wrong assignee, outside their authority, outside their skill, or for another valid reason.

Only `admin` and `super_admin` may use **Assign to Everyone**.

---

## 3. Core Domain Model

## 3.1 Todo

A Todo is a private personal reminder/work item owned by exactly one internal user.

### Fields

- `id`
- `owner_id`
- `title`
- `notes`
- `priority`: `low | normal | high | urgent`
- `scheduled_for` nullable timestamp
- `due_at` nullable timestamp
- `goal_id` nullable
- `status`: `open | completed | cancelled`
- `completed_at` nullable
- `created_at`
- `updated_at`

### Rules

- Only the owner can read the Todo.
- Only the owner can create, edit, complete, cancel or delete the Todo.
- A Todo can optionally link to a Goal the owner is allowed to see.
- A Todo may be delegated as a new Task.
- Delegating a Todo does not automatically complete the Todo.
- Delegation stores a link between the Todo and the resulting Task so the owner can see the shared work status.

---

## 3.2 Task

A Task is a shared work agreement between an assigner and one or more assignees.

Ordinary staff-to-staff delegation creates one Task with one assignee record.

Admin/Super Admin broadcast assignment creates one Task with separate assignee records for each recipient. Each recipient has an independent acceptance/status timeline.

### Task fields

- `id`
- `title`
- `description`
- `created_by`
- `source_todo_id` nullable
- `goal_id` nullable
- `priority`: `low | normal | high | urgent`
- `requested_start_at`
- `requested_due_at`
- `status`: aggregate/system-facing status where useful
- `cancelled_at` nullable
- `created_at`
- `updated_at`

### Task assignment fields

- `id`
- `task_id`
- `assignee_id`
- `assigned_by`
- `status`
- `agreed_start_at` nullable
- `agreed_due_at` nullable
- `accepted_at` nullable
- `completed_at` nullable
- `completion_note` nullable
- `rejection_reason_code` nullable
- `rejection_note` nullable
- `returned_at` nullable
- `created_at`
- `updated_at`

### Assignment statuses

- `pending_acceptance`
- `extension_pending`
- `active`
- `returned`
- `completed`
- `cancelled`

Derived UI states such as `due_soon` and `overdue` must not require separate permanent status values unless needed for query performance.

---

## 3.3 Extension Request

Deadline negotiation requires its own immutable request record rather than overwriting the Task assignment directly.

### Fields

- `id`
- `task_assignment_id`
- `requested_by`
- `original_due_at`
- `proposed_due_at`
- `reason`
- `status`: `pending | approved | declined`
- `decided_by` nullable
- `decided_at` nullable
- `decision_note` nullable
- `created_at`

### Rules

- Only the assignee may request an extension for their assignment.
- `proposed_due_at` must be later than the currently requested/agreed deadline.
- The assigner, `admin`, or `super_admin` may decide the request.
- Approval updates `agreed_due_at` and moves the assignment to `active`.
- Declining a pre-acceptance request returns the assignment to `pending_acceptance`.
- Declining a request made by an already active Task leaves the current agreed deadline unchanged and the Task active.

---

## 3.4 Task Event / History

Task history is immutable and records accountability events.

### Fields

- `id`
- `task_id`
- `task_assignment_id` nullable
- `actor_id`
- `event_type`
- `metadata` JSONB
- `created_at`

### Event examples

- `task_created`
- `task_assigned`
- `task_opened`
- `task_accepted`
- `extension_requested`
- `extension_approved`
- `extension_declined`
- `task_rejected`
- `task_returned`
- `task_reassigned`
- `task_completed`
- `task_cancelled`
- `goal_linked`

History may not be edited or deleted through the normal application UI.

---

## 3.5 Goal

A Goal represents an outcome rather than an individual activity.

### Visibility

- `personal` — creator only.
- `shared` — creator, selected contributors, and authorised Administration.
- `company` — visible to all internal staff; only `admin`/`super_admin` may create or change company Goals.

### Progress modes

#### Numeric Goal

Examples:

- 50 Ambassador conversions.
- ₦10,000,000 monthly revenue.
- 30 repairs completed.

Fields include:

- `target_value`
- `current_value`
- `unit`

Current value is manually editable by permitted Goal owners/managers in MVP. Future versions may bind Goal progress to live EmmyTech metrics.

#### Task-based Goal

Progress is calculated automatically from linked work, for example:

`4 of 7 linked Tasks completed`.

### Goal fields

- `id`
- `title`
- `description`
- `owner_id`
- `visibility`: `personal | shared | company`
- `progress_mode`: `numeric | tasks`
- `start_at`
- `target_at`
- `target_value` nullable
- `current_value` nullable
- `unit` nullable
- `status`: `active | achieved | cancelled | archived`
- `created_at`
- `updated_at`

### Goal contributors

Separate relation:

- `goal_id`
- `user_id`
- `added_by`
- `created_at`

---

## 4. Task Workflow

## 4.1 Standard assignment

```text
DRAFT
  -> PENDING ACCEPTANCE
       -> ACCEPT -> ACTIVE -> COMPLETED
       -> REQUEST MORE TIME -> EXTENSION PENDING
       -> REJECT -> RETURNED
```

### Accept

On acceptance:

- `accepted_at = now()`
- `agreed_start_at` becomes the requested start time, adjusted to now if appropriate in UI logic
- `agreed_due_at = requested_due_at`
- assignment becomes `active`
- accountability timers begin

### Reject

Rejection requires both:

1. reason category;
2. explanation text.

Approved reason categories:

- `outside_authority`
- `wrong_assignee`
- `insufficient_information`
- `workload_unavailable`
- `outside_skill`
- `other`

Rejection moves the assignment to `returned` and creates a history event/notification for the assigner.

### Reassign

Only a returned Task may be reassigned without cancelling the original Task. The returned assignment remains in history and a new assignment is created for the new recipient.

---

## 4.2 Extension before acceptance

1. Recipient receives Task.
2. Recipient proposes a later deadline and explanation.
3. Assignment becomes `extension_pending`.
4. Assigner/Admin decides.
5. If approved:
   - assignment becomes `active`;
   - proposed deadline becomes `agreed_due_at`;
   - acceptance is considered implicit.
6. If declined:
   - assignment returns to `pending_acceptance`;
   - original deadline remains requested;
   - recipient may Accept or Reject.

---

## 4.3 Extension after acceptance

1. Active assignee requests a later deadline.
2. Task remains visible as active with a pending extension indicator.
3. If approved, `agreed_due_at` changes to proposed deadline.
4. If declined, current `agreed_due_at` remains unchanged.

The previous deadline must remain in history.

---

## 4.4 Overdue calculation

An assignment is overdue only when:

- `status = active`; and
- `agreed_due_at < now()`; and
- `completed_at is null`.

`pending_acceptance`, `extension_pending`, `returned` and `cancelled` assignments must never count as overdue against the recipient.

Completed assignments may be classified for reporting as:

- completed on time;
- completed late.

---

## 5. Broadcast Tasks

Only `admin` and `super_admin` may create a Task targeted at **Everyone**.

A broadcast Task creates:

- one parent Task;
- one Task Assignment row per eligible internal staff member.

Each recipient independently accepts, requests an extension, rejects, or completes their assignment.

Example management view:

```text
Complete September Inventory Count

Toyin     Completed
Quddus    Active
Ibrahim   Extension requested
Success   Pending acceptance
Grace     Completed
Damife    Returned - not applicable
```

No one recipient's status changes another recipient's assignment.

---

## 6. Permissions and Privacy

## 6.1 Todo

| Actor | Read | Create/Edit | Complete/Delete |
|---|---:|---:|---:|
| Owner | Yes | Yes | Yes |
| Other staff | No | No | No |
| Admin/Super Admin | No | No | No |

Personal Todo privacy is intentional and must be enforced by RLS, not merely hidden in UI.

## 6.2 Task

A user may read a Task when they are:

- its creator/assigner;
- one of its assignees;
- Admin/Super Admin.

A normal staff member cannot browse unrelated Tasks assigned between two other employees.

### Assignment powers

- Any internal staff member may assign to any one internal staff member.
- Admin/Super Admin may assign to one person or Everyone.
- Only the assignment recipient may Accept/Reject/Request Extension for that assignment.
- Only the assigner or Admin/Super Admin may approve/decline extension requests.
- Only the assignee may mark their assignment complete.
- Assigner or Admin/Super Admin may cancel open Task assignments.

## 6.3 Goal

- Personal Goals: owner only.
- Shared Goals: owner + contributors + Admin/Super Admin.
- Company Goals: all internal staff can read; Admin/Super Admin manage.

---

## 7. User Experience

## 7.1 Command Centre header

The existing EmmyTech Command Centre header becomes work-aware.

Example:

```text
Good morning, Grace

3 tasks need your attention
2 due today
1 awaiting your acceptance
Goal progress this month: 68%

[View My Work]
```

When no immediate action is required:

```text
Good morning, Grace

You're clear for now.
Next task due tomorrow at 2:00 PM.
```

The header should prioritize meaningful attention states instead of showing permanently alarming counters.

---

## 7.2 Today panel on Command Centre

Before the department/workspace cards, display a compact **Today** panel.

Priority order:

1. Needs response.
2. Overdue accepted Tasks.
3. Due today.
4. Personal Todos scheduled for today.
5. Upcoming work.

Include a quick `+ Add Todo` action.

This is particularly important for operational users such as Ibrahim and Success: the first view after login should answer what needs doing before exposing larger departmental systems.

---

## 7.3 My Work workspace

The existing sidebar `My Tasks` entry becomes **My Work** and points to a real work-management route.

Primary navigation:

```text
Today | Tasks | Todo | Goals
```

Admin/Super Admin receives one extra tab:

```text
Today | Tasks | Todo | Goals | Team
```

No separate sidebar entry is needed for each concept.

---

## 7.4 Today view

Summary cards:

- Needs response
- Due today
- Overdue
- Upcoming

Sections render in urgency order rather than creation order.

A pending-acceptance Task always appears above ordinary upcoming work.

---

## 7.5 Todo view

Quick capture should remain minimal:

- title;
- date/time option;
- priority;
- optional Goal.

Todo actions:

- mark complete;
- edit;
- reschedule;
- delete;
- link/unlink Goal;
- Delegate as Task.

Delegation form requires:

- assignee;
- requested start;
- due date/time;
- priority;
- instructions;
- optional Goal.

---

## 7.6 Tasks view

Useful filters:

- Assigned to me
- Assigned by me
- Needs response
- Active
- Completed
- Returned

Each Task card should show:

- title;
- assignee or assigner depending on context;
- priority;
- status;
- agreed/requested deadline;
- related Goal if any.

A Task detail view contains:

- title and description;
- assigner;
- assignee;
- priority;
- requested start/deadline;
- agreed deadline where different;
- Goal;
- completion note where complete;
- current action buttons;
- immutable history timeline.

---

## 7.7 Recipient action UI

For `pending_acceptance`:

```text
[Accept] [Request More Time] [Reject]
```

Extension form:

- proposed deadline;
- mandatory reason.

Reject form:

- reason category;
- mandatory explanation.

For `active`:

```text
[Request More Time] [Mark Complete]
```

Completion requires a short completion note.

---

## 7.8 Goals view

Separate display groups:

- Company
- Shared
- Personal

Numeric Goals show progress bar and current/target values.

Task-based Goals show linked work completion count.

Goal detail includes:

- title;
- owner;
- contributors;
- start and target dates;
- progress;
- linked Todos visible to current user;
- linked Tasks visible to current user.

A Goal must not accidentally reveal another user's private Todo through the Goal page. Private Todo visibility rules always win.

---

## 7.9 Team view for Administration

Admin/Super Admin sees company/shared work, not private Todos.

Summary:

- pending acceptance;
- active;
- due today;
- overdue;
- extension requests.

Per-person rows may show aggregate company Task counts, e.g.:

```text
Grace    5 Active | 1 Due Today | 0 Overdue
Quddus   4 Active | 1 Extension Request
Success  3 Active | 1 Overdue
```

This view is intended for workload and accountability management, not private productivity surveillance.

---

## 8. Notifications

Use the existing EmmyTech OS notification/bell pattern rather than creating an unrelated alert system.

Generate internal notifications for:

- Task assigned;
- Task accepted;
- Task rejected/returned;
- extension requested;
- extension approved;
- extension declined;
- Task due soon;
- Task overdue;
- Task completed;
- user added to shared/company Goal.

MVP does not send WhatsApp, SMS or email notifications.

Those channels may be added later if actual usage shows that in-app notifications are insufficient.

---

## 9. Due-Soon Rules

For MVP:

- `due_today`: agreed deadline occurs before end of current local day.
- `due_soon`: active Task is due within the next 24 hours but is not yet overdue.
- `overdue`: active Task has passed agreed deadline.

The application should use the business/user timezone consistently. Store timestamps as `timestamptz` in PostgreSQL.

---

## 10. Dashboard Work Summary

The server-side dashboard loader should calculate a compact summary for the current user:

- pending acceptance count;
- pending extension decisions where current user is assigner;
- due today count;
- overdue count;
- next active Task;
- today's open Todo count;
- active Goal progress highlight where useful.

The dashboard must not fetch another employee's private Todos.

---

## 11. Database Security

RLS is mandatory for all new work-management tables.

### Required security properties

1. Private Todos cannot be selected by Admin through the normal client session.
2. Normal staff cannot select unrelated company Tasks.
3. Only valid assignment recipients can accept/reject/request extension/complete their assignment.
4. Extension decisions validate assigner/Admin authority server-side or in Security Definer RPCs.
5. Broadcast creation validates `admin`/`super_admin` server-side.
6. Company Goal creation validates `admin`/`super_admin` server-side.
7. Task history events are append-only through controlled functions.
8. Client-supplied actor IDs are never trusted when `auth.uid()` can determine the actor.
9. All deadline updates that change an agreed deadline create history.

Prefer narrowly-scoped Security Definer RPCs for lifecycle transitions over broad table `UPDATE` policies.

---

## 12. Recommended PostgreSQL Tables

- `work_todos`
- `work_tasks`
- `work_task_assignments`
- `work_task_extension_requests`
- `work_task_events`
- `work_goals`
- `work_goal_contributors`

No separate project/board/sprint tables in MVP.

---

## 13. Recommended RPC Boundary

Lifecycle transitions should be implemented as explicit functions such as:

- `work_create_task(...)`
- `work_assign_task(...)`
- `work_accept_task(p_assignment_id)`
- `work_reject_task(p_assignment_id, p_reason_code, p_note)`
- `work_request_extension(p_assignment_id, p_proposed_due_at, p_reason)`
- `work_decide_extension(p_request_id, p_decision, p_note)`
- `work_complete_task(p_assignment_id, p_completion_note)`
- `work_reassign_returned_task(p_assignment_id, p_new_assignee_id, ...)`
- `work_cancel_assignment(p_assignment_id, p_reason)`
- `work_create_broadcast_task(...)`

Todo CRUD can use normal RLS-backed operations because only the owner can access their own records.

Goal mutations can use RLS plus narrow RPCs where visibility/role checks become complex.

---

## 14. Out of Scope for MVP

Do not add these during the first implementation:

- Kanban boards;
- projects/folders;
- sprints;
- task dependencies;
- subtasks;
- file attachments;
- recurring Tasks;
- comments/chat threads;
- employee scoring/ranking;
- automatic disciplinary consequences;
- mandatory completion approval;
- external email/SMS/WhatsApp alerts;
- automatic metric integration for numeric Goals;
- Ambassador participation.

These may be considered only after staff actually use the MVP and a real operational need appears.

---

## 15. Success Criteria

The first release is successful when all of the following are true:

1. Every internal employee can create private Todos.
2. Admin cannot browse another employee's private Todos through the ordinary UI/session.
3. Any internal employee can delegate a Task to another internal employee.
4. Every delegated Task requires a requested start and due date/time.
5. Recipient must Accept, Request More Time, or Reject before responsibility becomes active.
6. Pending acceptance never creates an overdue mark against the recipient.
7. Rejection requires reason + explanation and returns the Task to the assigner.
8. Returned Tasks can be edited/reassigned/cancelled without losing history.
9. Deadline extensions require recipient request and assigner/Admin decision.
10. Approved pre-acceptance extension activates the Task immediately.
11. Completed Tasks require a completion note.
12. Admin/Super Admin can create one broadcast Task with independent assignments for all staff.
13. Personal, Shared and Company Goals obey their visibility rules.
14. Task-based Goal progress updates from linked work.
15. The Command Centre highlights actionable work immediately after login.
16. My Work provides Today, Tasks, Todo and Goals; Admin also gets Team.
17. Internal notifications cover assignment and lifecycle events.
18. All lifecycle changes are represented in immutable Task history.
19. Staff cannot use the feature to expose unrelated users' private Todos or Tasks.
20. Existing CRM, Marketing, Sales, Operations, staff RBAC and Ambassador flows continue to pass regression tests.

---

## 16. Approved Product Decisions

The following decisions are final for this implementation unless explicitly revisited:

- Use the **Todo + Task + Goal** architecture.
- Todo privacy model = **Private by default**.
- Delegated Tasks require start/due timeframe.
- Recipient must explicitly accept responsibility.
- Recipient may request deadline extension.
- Assigner/Admin approves or declines extensions.
- Approved pre-acceptance extension acts as acceptance.
- Rejected Task returns to assigner.
- Rejection requires reason and explanation.
- Any internal staff member may delegate to any other internal staff member.
- Only Admin/Super Admin may Assign to Everyone.
- No automatic reassignment.
- No overdue accountability before acceptance.
- Todo delegation does not auto-complete the source Todo.
- Completion requires a note but no approval in MVP.
- Admin Team view excludes personal Todos.
- No Kanban/project-management expansion in MVP.
