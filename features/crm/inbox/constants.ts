// features/crm/inbox/constants.ts
//
// Surface names for the two outreach work surfaces.
//
// The assist strips are MOUNTED (assists doctrine: every page asks which
// assists it needs and mounts them in place). No producer writes to them yet —
// the first one belongs with the inbound-classification server half: when a
// reply arrives with no classifier verdict, that is a real, one-click-fixable
// gap and exactly the shape `platform.assists` exists for. The strip renders
// nothing until then, so mounting it costs the user nothing and costs the next
// agent one line instead of a page edit.

export const INBOX_ASSIST_SURFACE = "matrx-user/crm-inbox";
export const CHASEBOX_ASSIST_SURFACE = "matrx-user/crm-chasebox";
