// app/(authenticated)/schedules/[id]/page.tsx

import { ScheduleDetail } from "@/features/scheduling/components/detail/ScheduleDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ScheduleDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="h-full overflow-y-auto bg-textured px-4 sm:px-6 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <ScheduleDetail taskId={id} />
    </div>
  );
}
