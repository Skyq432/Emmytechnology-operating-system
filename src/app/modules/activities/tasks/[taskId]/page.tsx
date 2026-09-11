import TaskDetail from '@/components/work/task-detail';
import { requireInternalUser } from '@/lib/auth/server';
import { getTaskDetail, listAssignableStaff } from '@/lib/work/server';

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const { user, role } = await requireInternalUser();
  const [detail, staff] = await Promise.all([
    getTaskDetail(taskId),
    listAssignableStaff(),
  ]);

  return (
    <TaskDetail
      detail={detail}
      staff={staff}
      currentUserId={user.id}
      isAdmin={role === 'admin' || role === 'super_admin'}
    />
  );
}
