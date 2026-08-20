// features/education/compliance/FirstSignInAgeGateMount.tsx
//
// THE post-sign-in age prompt, platform-wide. Render-free.
//
// RULED BY ARMAN, 2026-08-20:
//   "It's not sign up. It's after the first time that they sign in. I don't
//    wanna get in the way of sign up for some bullshit like this. It's gonna be
//    one of those pop ups ... and makes it really easy for them to select their
//    age range. And the main thing is if they're over eighteen or not."
//
// So: nothing is asked during signup (the signup form's age field was removed in
// the same change), and the question is asked once the user is actually IN the
// app — mounted in `app/DeferredSingletonCore.tsx` beside AnnouncementProvider,
// the existing after-you-are-signed-in popup tree, which loads post-mount and
// post-idle so this never competes with first paint.
//
// SCOPE — signed-in accounts only (`reason === "age_undeclared"`). A GUEST
// (`guest_age_undeclared`) is deliberately NOT prompted here: a guest is not
// "signed in", and a guest is genuinely BLOCKED from education AI, so their
// prompt belongs where that block bites — `EducationAgeGateMount` and the
// per-action `useAiComplianceGate`. Exactly one prompt can fire per user.
//
// NOT A BLOCK. Verified against `prosrc` on 2026-08-20: `edu_coppa_gate_for`
// ALLOWS an undeclared signed-in account by design ("Undeclared SIGNED-IN ->
// ALLOW (nudge only; do not re-break established accounts)"). Docs asserting
// that a null band kills AI runs for signed-in users are WRONG. This prompt
// exists to move people out of the undeclared state, not to unblock them —
// which is exactly why it must never be modal-feeling or hard to escape.
//
// DISMISSAL. Closing it writes nothing and blocks nothing; we simply do not ask
// again for the rest of this tab session (sessionStorage), and ask again on the
// next one. The band is never left permanently NULL with no way back: the
// per-action gate still offers the same prompt inside education AI, and
// /education/family can always set it. Deliberately no "don't ask again" —
// COPPA declaration is not a preference to opt out of.

"use client";

import { useEffect, useRef } from "react";
import { coppaService } from "./coppaService";
import { useAiComplianceGate } from "./useAiComplianceGate";

/** Ask at most once per tab session; a new session asks again. */
const SESSION_KEY = "matrx.age_band_prompt.asked.v1";

function alreadyAskedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Private mode / storage disabled — degrade to "ask once per mount", which
    // is what this singleton gives us anyway. Never let storage break the flow.
    return false;
  }
}

function markAskedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* see above */
  }
}

export function FirstSignInAgeGateMount() {
  const gate = useAiComplianceGate({ declarationVariant: "first_run" });
  const { loading, gate: verdict, promptDeclarationIfNeeded, reload } = gate;
  // The silent signup-metadata apply is tried at most once per mount.
  const triedMetaApply = useRef(false);

  useEffect(() => {
    if (loading) return;
    // Signed-in AND undeclared is the only case this mount owns. A declared
    // account, a guest, or a still-loading gate is a no-op.
    if (!verdict || verdict.ageBand !== null || verdict.reason !== "age_undeclared")
      return;
    if (alreadyAskedThisSession()) return;

    let cancelled = false;
    void (async () => {
      // A tail of accounts created before the signup age field was removed may
      // still carry `education_age_band` in auth metadata. Honour it silently —
      // never ask a question they already answered.
      if (!triedMetaApply.current) {
        triedMetaApply.current = true;
        const fromSignup = await coppaService.signupAgeBand();
        if (fromSignup) {
          const res = await coppaService.setAgeBand(fromSignup);
          if (cancelled) return;
          // A first declaration can never be `status: "blocked"` (the block only
          // fires on a self-declared move UP out of under_13), so any non-error
          // outcome means the band is settled — re-read and stop.
          if (!res.error) {
            reload();
            return;
          }
        }
      }
      if (cancelled) return;
      markAskedThisSession();
      promptDeclarationIfNeeded();
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, verdict, promptDeclarationIfNeeded, reload]);

  return <gate.Gate />;
}
