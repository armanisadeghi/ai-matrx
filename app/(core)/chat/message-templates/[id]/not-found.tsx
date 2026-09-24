"use client";

// The 404 boundary for this message-template route. The page throws
// notFound() when the agent.message_template read comes back empty or
// refused; the canonical access gate says which of denied / deleted / never
// existed / signed out it is, instead of the bare root 404.

import { useParams } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

export default function MessageTemplateUnavailable() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <AccessGate
        token="message_template"
        id={id}
        fallbackHref="/chat/message-templates"
        fallbackLabel="Message templates"
      />
    </div>
  );
}
