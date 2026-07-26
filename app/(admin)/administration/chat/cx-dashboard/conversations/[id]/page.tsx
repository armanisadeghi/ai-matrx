import { fetchConversationDetail } from "@/features/cx-dashboard/service";
import { ConversationDetailContent } from "./conversation-detail-content";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConversationDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await fetchConversationDetail(id);

  if (!detail.conversation) {
    notFound();
  }

  return <ConversationDetailContent detail={detail} />;
}
