import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The old edit URL. A saved template has ONE editor — the template page in edit mode
 * (`/chat/message-templates/[id]?mode=edit`, what every menu links to). Both URL forms keep working.
 */
export default async function EditTemplatePage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/chat/message-templates/${encodeURIComponent(id)}?mode=edit`);
}
