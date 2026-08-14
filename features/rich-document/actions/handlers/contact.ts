// features/rich-document/actions/handlers/contact.ts
//
// "Save as contact" — the CRM's one universal capture point.
//
// Registered here rather than wired per-surface on purpose: the moment a user
// sees a person's name, an email signature, a byline or a company footer, they
// are on whatever surface happens to show it — a note, a chat message, a
// scraped page, a transcript, a PDF extraction. A CRM that only captures from
// /crm captures nothing. This action rides the ONE menu that is already on
// every surface, so highlight-anywhere works with zero per-surface wiring.
//
// It is deliberately source-agnostic and content-gated: `visible` runs the same
// deterministic parser the dialog opens with, so the row appears only when the
// selection actually contains a name, an email or a phone — never a dead verb
// on a paragraph of prose (the no-fake-menu rule).
//
// The action itself only OPENS the review dialog. Nothing is written until the
// user presses Save, and the save runs through the governed server resolver —
// see SaveContactFromSelectionDialog for why there is no direct-insert path.

import { Contact } from "lucide-react";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { looksLikeContact } from "@/features/crm/agent-context/parseContactSelection";
import { registerAction } from "../registry";
import { requireAuth } from "../utils";

registerAction({
  id: "save-to-contact",
  label: "Save as contact",
  icon: Contact,
  iconColor: "text-teal-500 dark:text-teal-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  // After the notes/code saves, before Download — capture verbs together.
  order: 7,
  requiresAuth: true,
  visible: (ctx) => looksLikeContact(ctx.content),
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-contact",
        "Save as contact",
        "Sign in to save people and companies to your CRM.",
      )
    )
      return;
    ctx.dispatch(
      openOverlay({
        overlayId: "saveContactFromSelection",
        instanceId: ctx.instanceKey("save-contact"),
        data: {
          selection: ctx.content,
          origin:
            typeof window !== "undefined"
              ? `Saved from ${window.location.pathname}`
              : "Saved from a selection in the app",
        },
      }),
    );
  },
});
