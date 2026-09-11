import TaskDetail from '@/components/work/task-detail';
import { getTaskDetail, listAssignableStaff } from '@/lib/work/server';

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const [detail, staff] = await Promise.all([
    getTaskDetail(taskId),
    listAssignableStaff(),
  ]);

  return <TaskDetail detail={detail} staff={staff} />;
}
