"use client";

// features/cx-dashboard/explorer/CxRequestsDrill.tsx — THE CX DASHBOARD'S REQUESTS, ERRORS AND CONVERSATIONS
// TABS AS ONE EXPLORER (lane DRILL-WAVE2-B). Each tab is a first question of the declared definition
// `cx_requests` (aidream apps/shared/records/scripts/drill-definitions/cx_requests.drill.ts) asked in the
// platform lane; the tab's own list (row menus, copy for AI, exports, source filters, the conversation
// search) stays one control away (`rows=1`) because the explorer does not reproduce those actions.

import type { ReactNode } from "react";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import { DrillOrList } from "@/components/official/drill-explorer/DrillOrList";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";

export type CxDrillPage = "requests" | "errors" | "conversations";

const PAGES: Record<CxDrillPage, { title: string; rootLabel: string; listLabel: string; question: MatrxDrillQuestion }> = {
  // the requests tab: who answered them, how they ended, what they cost
  requests: {
    title: "User requests",
    rootLabel: "All requests",
    listLabel: "Request list",
    question: {
      by: ["agent"],
      show: ["requests", "failed", "cost", "tokens_total", "duration_median"],
      where: [],
      sort: { key: "requests", direction: "desc" },
      window: "30d",
    },
  },
  // the errors tab: how requests ended, the ones that did not finish first
  errors: {
    title: "Request problems",
    rootLabel: "All requests",
    listLabel: "Problem list",
    question: {
      by: ["status"],
      show: ["requests", "with_error", "truncated", "cost"],
      where: [],
      sort: { key: "with_error", direction: "desc" },
      window: "30d",
    },
  },
  // the conversations tab: one row per conversation, newest activity first
  conversations: {
    title: "Conversations",
    rootLabel: "All conversations",
    listLabel: "Conversation list",
    question: {
      by: ["conversation"],
      show: ["cost", "requests", "tokens_in", "tokens_out", "started", "last_activity", "duration"],
      where: [],
      sort: { key: "last_activity", direction: "desc" },
      window: "30d",
    },
  },
};

export function CxRequestsDrill({ page, children }: { page: CxDrillPage; children: ReactNode }) {
  const p = PAGES[page];
  return (
    <DrillOrList
      definition="cx_requests"
      listLabel={p.listLabel}
      list={children}
      renderDrill={(extras) => (
        <DrillExplorer
          source={{ kind: "entity", token: "cx_requests" }}
          lane="platform"
          // org-fallback-deliberate: the platform lane of an admin explorer asks in the platform's own organization (its calendar is UTC)
          organizationId={SYSTEM_ORGANIZATION_ID}
          timeZone="UTC"
          title={p.title}
          rootLabel={p.rootLabel}
          firstQuestion={p.question}
          names={{ person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") }}
          headline={{ measure: "requests", also: ["failed", "cost"] }}
          rowNoun="request"
          countMeasure="requests"
          openRecord={{ column: "conversation_id", label: "Open conversation", href: (id) => `/administration/chat/cx-dashboard/conversations/${id}` }}
          location={`Administration › CX dashboard › ${p.title}`}
          headerExtras={extras}
          dataAttributes={{ "data-cx-requests-drill": page }}
        />
      )}
    />
  );
}
