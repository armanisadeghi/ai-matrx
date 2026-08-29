// features/continued-access/portalFeatures.tsx
//
// THE FEATURE TABLE — the whole extensibility story of the departed-member portal.
//
// 🚨 ADDING THE NEXT ASPECT IS ONE ENTRY HERE AND ONE KNOB IN THE DATABASE. Arman named three
// aspects when he ruled this primitive (2026-08-29): answering a verification request, asking a
// former manager for a reference or a letter of recommendation, and requesting the return of
// records the person had stored in the system. Only the first is built. When the second ships,
// it is a `continued_access.<key>_enabled` knob, a row in this table, and NOTHING ELSE — the
// portal page never learns a new shape.
//
// 🚨 A FEATURE THE ORGANIZATION HAS NOT SWITCHED ON RENDERS NOTHING. Not disabled, not greyed,
// not "coming soon" — absent. The `features` array from `continued_access_portal` is the whole
// contract, and an aspect the org never agreed to offer must leave no trace on the page that a
// former employee could ask about.

import type { ReactNode } from "react";

import { MyVerificationConsents } from "@/features/hr/me/MyVerificationConsents";

export type PortalFeature = {
  /** The string the door emits, which is the knob key minus `_enabled`. */
  key: string;
  title: string;
  /** Why this is here, in the person's own terms. */
  blurb: string;
  render: () => ReactNode;
};

export const PORTAL_FEATURES: Record<string, PortalFeature> = {
  verification_consent: {
    key: "verification_consent",
    title: "Employment and income verification",
    blurb:
      "When someone — a lender, a landlord, an agency — asks your former employer to confirm " +
      "what you earned, nothing about your pay is shared unless you agree to it here.",
    // 🚨 MOUNTED AS-IS, NEVER FORKED. `MyVerificationConsents` takes no props and needs no
    // employer context: the doors behind it scope themselves by LOGIN LINKAGE, which is exactly
    // why they still answer for someone whose membership has ended. Copying it to "adapt it for
    // former employees" would fork the one surface where consent is worded correctly.
    render: () => <MyVerificationConsents />,
  },
};
