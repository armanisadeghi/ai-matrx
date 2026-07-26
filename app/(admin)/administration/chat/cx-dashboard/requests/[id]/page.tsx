import { fetchUserRequestDetail } from "@/features/cx-dashboard/service";
import { RequestDetailContent } from "./request-detail-content";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RequestDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await fetchUserRequestDetail(id);

  if (!detail.user_request) {
    notFound();
  }

  return <RequestDetailContent detail={detail} />;
}
