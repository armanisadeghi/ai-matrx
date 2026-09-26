// components/icons/domain-icons.ts
//
// OFFICIAL DOMAIN ICONS — one icon per platform Domain, owned here and nowhere
// else. A person learns "this icon means Intelligence" only if it never means
// anything else.
//
//   INTELLIGENCE_ICON — lucide BrainCircuit. RESERVED for Intelligence and
//     Mandates (Arman, 2026-09-26). Importing BrainCircuit anywhere else is a
//     violation: `pnpm check:reserved-icons` fails on a new one.
//   AGENT_ICON — lucide Webhook. The official Agents icon (nav, holders, cards).
//
// String-keyed icon registries (shell nav `iconName`, menu registries) use the
// *_ICON_NAME constants so the name is spelled in one place.

import { BrainCircuit, Webhook, type LucideIcon } from "lucide-react";

/** Intelligence / Mandates — reserved; never for generic "AI". */
export const INTELLIGENCE_ICON: LucideIcon = BrainCircuit;
export const INTELLIGENCE_ICON_NAME = "BrainCircuit" as const;

/** Agents. */
export const AGENT_ICON: LucideIcon = Webhook;
export const AGENT_ICON_NAME = "Webhook" as const;
