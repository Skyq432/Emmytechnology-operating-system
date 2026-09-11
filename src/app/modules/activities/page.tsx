import MyWorkWorkspace from '@/components/work/my-work-workspace';
import { requireInternalUser } from '@/lib/auth/server';
import {
  getMyGoals,
  getMyTasks,
  getMyTodos,
  getMyWorkDashboard,
  getTeamWorkSummary,
  listAssignableStaff,
} from '@/lib/work/server';

export default async function ActivitiesPage() {
  const { user, profile, role } = await requireInternalUser();
  const isAdmin = role === 'admin' || role === 'super_admin';

  const [summary, todos, tasks, goalsResult, staff, team] = await Promise.all([
    getMyWorkDashboard(),
    getMyTodos(),
    getMyTasks(),
    getMyGoals(),
    listAssignableStaff(),
    isAdmin ? getTeamWorkSummary() : Promise.resolve(null),
  ]);

  return (
    <MyWorkWorkspace
      currentUser={{
        id: user.id,
        name: profile.name || user.email || 'EmmyTech Staff',
        role,
      }}
      summary={summary}
      todos={todos}
      tasks={tasks}
      goals={{
        goals: goalsResult.goals,
        contributors: goalsResult.contributors,
        progress: Object.fromEntries(goalsResult.progress),
      }}
      staff={staff}
      team={team}
    />
  );
}
