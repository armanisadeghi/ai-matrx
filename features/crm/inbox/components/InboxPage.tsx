"use client";

/**
 * InboxPage — /crm/inbox, the unified outreach inbox.
 *
 * A config on the ONE list shell (lib/entity-list), never a bespoke variant.
 * Everything visible is a view over crm.interaction; the doors out (the
 * contact, the campaign, the mailbox, the motivating record) are in the column
 * registry, and the reply action reuses the canonical send dialog.
 */

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { inboxListConfig } from "../listConfig";
import { INBOX_ASSIST_SURFACE } from "../constants";

export function InboxPage() {
  return (
    <EntityListPage
      config={inboxListConfig}
      notice={<AssistStrip surfaceName={INBOX_ASSIST_SURFACE} />}
      headerActions={
        // The inbox answers "who replied"; the Chasebox answers "what needs me
        // now" across every queue, replies included. Each reaches the other.
        <Button asChild size="sm" variant="outline">
          <Link href="/crm/chasebox">
            <ListChecks className="h-4 w-4" aria-hidden />
            Chasebox
          </Link>
        </Button>
      }
    />
  );
}
