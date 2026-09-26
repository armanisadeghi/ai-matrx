// app/(admin)/administration/automation/scheduling/tasks/[id]/page.tsx
//
// The ADMIN seat's record page for one scheduled task. It renders the same
// canonical `ScheduleDetail` the user page `/schedules/<id>` renders, but under
// /administration, so every read rides the admin lane (platform_admin_read):
// system jobs and other people's tasks open here, where the user page answers
// "We couldn't find this scheduled task". Every admin scheduling surface links
// here through `adminScheduleHref` (features/scheduling/constants/routes.ts).

import { ScheduleDetail } from "@/features/scheduling/components/detail/ScheduleDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminScheduleDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="h-full overflow-y-auto px-4 pb-16 pt-4 sm:px-6">
      <ScheduleDetail taskId={id} seat="admin" />
    </div>
  );
}
