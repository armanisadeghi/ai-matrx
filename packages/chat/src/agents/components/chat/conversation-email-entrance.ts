// features/agents/components/chat/conversation-email-entrance.ts
//
// THE CHAT ENTRANCE TO "SEND EMAIL", AS A PURE FUNCTION.
//
// B-1's own sentence is "compose from a Person, a deal, or the chat"; the chat
// third was missing — `useOpenGmailComposeWindow` had three call sites and none
// of them was in a chat surface (VERIFY-B1-B2-R2 A1). `ConversationPageMenu`
// now opens the SAME compose window through the SAME opener, and this module is
// the decision it makes: which People this conversation can be emailed from.
//
// It is separate from the component so it can be tested without a store, and so
// there is one answer if a second chat surface ever wants the same entrance.
//
// Pure: no React, no Supabase.

/** The shape of an association edge this reads — the package's, narrowed. */
export interface ConversationEdgeLike {
  otherType: string;
  otherId: string;
  label: string | null;
  orgId: string | null;
}

/** What the opener needs for one entrance. */
export interface ConversationEmailEntrance {
  partyId: string;
  organizationId: string;
  partyLabel: string;
}

/**
 * The People this conversation is associated with, deduplicated, in edge order.
 *
 * An edge with no organization is LEFT OUT: the compose window cannot write a
 * sent record without an organization, and an entry that opens nothing is worse
 * than no entry (THE DOOR LAW — a control either works or is absent). The
 * compose panel then files the row under the PARTY's own organization, so this
 * value is only what opens the window.
 */
export function conversationEmailEntrances(
  edges: ConversationEdgeLike[],
): ConversationEmailEntrance[] {
  const seen = new Set<string>();
  const out: ConversationEmailEntrance[] = [];
  for (const edge of edges) {
    if (edge.otherType !== "party") continue;
    if (!edge.otherId || !edge.orgId) continue;
    if (seen.has(edge.otherId)) continue;
    seen.add(edge.otherId);
    out.push({
      partyId: edge.otherId,
      organizationId: edge.orgId,
      partyLabel: edge.label ?? "this person",
    });
  }
  return out;
}
