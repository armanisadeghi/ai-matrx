// app/(authenticated)/schedules/[id]/page.tsx

import { ScheduleDetail } from "@/features/scheduling/components/detail/ScheduleDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ScheduleDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <ScheduleDetail taskId={id} />
      </div>
    </div>
  );
}
