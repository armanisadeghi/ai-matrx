// record-view: SpendAlarmRecordPage — the ONE page for one spend alarm (billing.spend_alarm).
// Every alarm surface (the sign-in panel, the list, the writer's delivered link) opens here.
import { SpendAlarmRecordPage } from "@/features/admin/spend-alarms/SpendAlarmRecordPage";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SpendAlarmPage({ params }: Props) {
  const { id } = await params;
  return <SpendAlarmRecordPage id={id} />;
}
