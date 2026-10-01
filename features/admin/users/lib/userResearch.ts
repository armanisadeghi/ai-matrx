import { z } from "zod";

export const EARLY_USER_CUTOFF = "2026-06-01T00:00:00Z";
export const AI_MATRX_CRM_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
export const RELATIONSHIP_LABELS = {
  unknown: "Unknown", real_user: "Real user", friend: "Friend", family: "Family",
  employee: "Employee", former_employee: "Former employee", owner: "Owner",
  test: "Test account", bot: "Bot",
} as const;
export const CONTACT_STATE_LABELS = {
  not_contacted: "Not contacted", draft: "Draft", contacted: "Contacted",
  replied: "Replied", trial_active: "Trial active", declined: "Declined",
  hold: "On hold", opted_out: "Opted out",
} as const;
export const RelationshipSchema = z.enum(Object.keys(RELATIONSHIP_LABELS) as [keyof typeof RELATIONSHIP_LABELS, ...Array<keyof typeof RELATIONSHIP_LABELS>]);
export const ContactStateSchema = z.enum(Object.keys(CONTACT_STATE_LABELS) as [keyof typeof CONTACT_STATE_LABELS, ...Array<keyof typeof CONTACT_STATE_LABELS>]);
export type Relationship = z.infer<typeof RelationshipSchema>;
export type ContactState = z.infer<typeof ContactStateSchema>;
export const UserResearchSchema = z.object({
  id: z.uuid(), subject_id: z.uuid(), party_id: z.uuid(), created_by: z.uuid(),
  organization_id: z.uuid(), label: z.string(), category: RelationshipSchema,
  notes: z.string(), contact_state: ContactStateSchema,
  outreach: z.record(z.string(), z.unknown()), version: z.number().int(),
  updated_at: z.string(),
});
export type UserResearch = z.infer<typeof UserResearchSchema>;

export interface DiscoveryEvidence {
  category: Relationship;
  contactState: ContactState;
  banned: boolean;
  kind: "person" | "team" | "test" | "bot";
  lastActivity: string | null;
  sharedOrganizations: string[];
  membershipsChecked: boolean;
  affiliationsChecked: boolean;
  invitationsChecked: boolean;
  suppressionChecked: boolean;
  partyResolved: boolean;
}

/** Relationship comes before engagement; unread mandatory sources never mean no connection. */
export function discoveryDisposition(e: DiscoveryEvidence): "known" | "hold" | "historical" | "needs_review" | "candidate" {
  if (["employee", "former_employee", "friend", "family", "owner", "test", "bot"].includes(e.category) || e.kind !== "person") return "known";
  if (e.banned || e.contactState !== "not_contacted") return "hold";
  if (e.lastActivity && !Number.isFinite(Date.parse(e.lastActivity))) return "needs_review";
  if (!e.lastActivity || Date.parse(e.lastActivity) < Date.parse(EARLY_USER_CUTOFF)) return "historical";
  if (!e.membershipsChecked || !e.affiliationsChecked || !e.invitationsChecked || !e.suppressionChecked || !e.partyResolved || e.sharedOrganizations.length || e.category !== "real_user") return "needs_review";
  return "candidate";
}

/** Coarse labels only. A conversation title or prompt is never a personalization source. */
export const OUTREACH_FEATURE_LABELS = { general: "", workspace: "our workspace", agents: "our agents", chat: "our chat", podcasts: "our podcast tools" } as const;
export function feedbackInvitation(firstName: string, plan: string, feature: keyof typeof OUTREACH_FEATURE_LABELS = "general"): string {
  const greeting = firstName.trim().split(/\s+/)[0] || "there";
  const visit = OUTREACH_FEATURE_LABELS[feature];
  return `Hi ${greeting}. This is Arman, not one of the agents. lol. I'm the founder of AI Matrx and the lead engineer.\n\n${visit ? `I noticed you tried ${visit}. ` : ""}Not sure how you sneaked in, but I'm happy you did. We're doing invitation-only trials right now, and I'd love to offer you three months of ${plan} for free in exchange for honest feedback.\n\nTell me what feels confusing, what gets in your way, and what you'd like us to improve. If you've got a good idea or an obstacle we can solve, you might even get a custom feature built for you pretty quickly.\n\nInterested? Just reply here and I'll help get you set up.\n\nArman`;
}

/** A prepared invitation reserves the account; it does not erase prior contact or holds. */
export function researchContactState(state: ContactState, hasDraft: boolean): ContactState {
  if (hasDraft && state === "not_contacted") return "draft";
  return !hasDraft && state === "draft" ? "not_contacted" : state;
}

/** Same sender, conversation and final text produce the same replay key after a reload. */
export async function feedbackDmKey(senderId: string, conversationId: string, content: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([senderId, conversationId, content.trim()]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `early-user-feedback:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
}
