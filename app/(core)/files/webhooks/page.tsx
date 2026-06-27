/**
 * app/(core)/files/webhooks/page.tsx
 *
 * Outbound webhook management. Register HTTPS endpoints to receive signed
 * callbacks when your events fire. CRUD is owner-scoped direct-to-DB; delivery
 * runs DB-side (files.webhook_* pipeline). See features/files/webhooks/.
 */

import type { Metadata } from "next";
import { WebhooksManager } from "@/features/files/webhooks/components/WebhooksManager";

export const metadata: Metadata = { title: "Webhooks | Files" };

export default function FilesWebhooksPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-y-auto bg-textured">
      <WebhooksManager />
    </div>
  );
}
