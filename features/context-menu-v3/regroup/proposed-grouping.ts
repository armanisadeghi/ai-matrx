// features/context-menu-v3/regroup/proposed-grouping.ts
//
// THE PROPOSED GROUPING (2026-09-27, awaiting Arman's approval on
// /demos/context-menu-regroup). Applied ONLY where a MenuRegroupContext asks
// for it — no production menu uses it. Plain data over the registry's own
// action ids and categories: the rows themselves come from the registry.
//
// Order in the menu: the page's own actions first, the Copy/Cut/Paste strip,
// then Copy ▸, Save to… ▸, Share ▸, AI ▸, Read aloud ▸, and Quick Actions /
// feedback / admin / the page submenu last (the package's group order decides
// the rest). Submenu names are plain, conventional words.

import { Copy, Download, Share2, Volume2 } from "lucide-react";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import type { MenuGrouping } from "./grouping";

export const PROPOSED_MENU_GROUPING: MenuGrouping = {
  name: "Page first, then Copy / Save to… / Share / AI / Read aloud",
  minMembers: 2,
  groups: [
    { key: "copy", label: "Copy", icon: registerAlchemyIcon(Copy), category: "copy", order: 0 },
    { key: "save", label: "Save to…", icon: registerAlchemyIcon(Download), category: "save", order: 0 },
    { key: "share", label: "Share", icon: registerAlchemyIcon(Share2), category: "share", order: 0 },
    { key: "ai", label: "AI", icon: registerAlchemyIcon(AGENT_ICON), category: "ai", order: 0 },
    { key: "listen", label: "Read aloud", icon: registerAlchemyIcon(Volume2), category: "listen", order: 0 },
  ],
  rules: [
    // The clicked thing's own rows (a quiz row's Open / Take / Archive, a note's rows).
    { when: { pageOwn: true }, to: { kind: "page-first" } },
    // The universal verb strip and in-place editing stay exactly where they are.
    { when: { ids: ["cm:copy", "cm:cut", "cm:paste", "cm:undo", "cm:redo", "cm:find", "copy"] }, to: { kind: "top" } },
    // Copy formats and compare.
    {
      when: {
        ids: ["cm:copy-as", "cm:json", "cm:compare", "compare-with-clipboard", "set-compare-base", "compare-with-base"],
        categories: ["copy"],
      },
      to: { kind: "group", key: "copy" },
    },
    // Read aloud: speak, listen, summaries for listening, voice settings.
    { when: { ids: ["cm:speak", "cm:listen"], categories: ["listen"] }, to: { kind: "group", key: "listen" } },
    // Share and attach.
    { when: { ids: ["cm:attach", "cm:share"], categories: ["share"] }, to: { kind: "group", key: "share" } },
    // Save a copy somewhere: notes, files, documents, downloads, print, convert, study cards.
    {
      when: { ids: ["cm:export", "cm:convert"], categories: ["save", "export", "study"] },
      to: { kind: "group", key: "save" },
    },
    // Everything AI: chat, agents, shortcuts, content blocks, ask.
    {
      when: { ids: ["cm:chat"], idPrefixes: ["cm:placement:", "cm:cat:", "cm:agents"], categories: ["ai", "ask"] },
      to: { kind: "group", key: "ai" },
    },
  ],
  // Everything else (history, edit tools, Quick Actions, feedback, admin, the
  // page submenu) stays at the top level where the package places it.
  fallback: { kind: "top" },
};
