// features/hr/shared/HrAccessDenied.tsx
//
// THE ONE PLACE HR REFUSES A VIEWER — and it is the PLATFORM'S refusal screen,
// wearing HR's sentence.
//
// Ruling (owner, 2026-08-30, after landing on an HR refusal from an SMS deep
// link): *"Even when someone has no access, we use our canonical primitive — our
// system already has a unified way of handling what happens when someone lands
// on a page they don't have authority for: clearly telling them they don't have
// access and giving them an easy way to click to request access."*
//
// So: the FRAME is `features/access-gate` (`AccessDeniedView` / `AccessGate`) —
// one look, one door law, one request-access affordance. The CONTENT is HR's
// own earned sentence, which the surface knows and the platform resolver never
// can. Nothing here re-implements a denial screen; there is exactly one wrapper
// and every HR surface reaches it through `HrNoAccess`.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE REQUEST AFFORDANCE IS NOT UNIVERSAL. THIS IS THE WHOLE POINT.
//
// HR has doors that are dead ends BY LAW, where the ask itself is the leak:
//
//   • the §5 SUBJECT-EXCLUSION VETO — an accused person may never request the
//     case against them; a "Request access" button on that page would confirm a
//     case exists and name who holds it (`hr._door_verdict`, relations
//     `service.ts`);
//   • CONFIDENTIAL-TIER records, where the refusal must read identically
//     whether the record is unreachable or does not exist (`useHrProfile`: the
//     envelope deliberately destroys that difference and *nothing here may
//     recover it*).
//
// So HR's default is `absolute`: no request panel, no owner, no organization,
// no kind, no title — the canonical frame with everything disclosing removed.
// A refusal becomes requestable ONLY by naming the thing that can actually be
// asked for, which today is exactly one case: the EMPLOYER a link named that
// this person has no standing in. That one is genuinely askable, because the
// organization's owners and admins are real people who can say yes.
//
// Adding a requestable class here is a deliberate act. Defaulting is safe.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState, type ReactNode } from "react";

import { AccessDeniedView } from "@/features/access-gate/components/AccessDenied";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { resolveAccessGateSlug } from "@/features/access-gate/service/accessDeniedContext";
import type { AccessDeniedContext } from "@/features/access-gate/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The context an ABSOLUTE refusal renders through.
 *
 * Every field that could disclose is empty, and that is not laziness — it is the
 * contract. `disclosure: "none"` and a blank entity mean the frame cannot name a
 * kind, a title, an owner, or an organization even if it wanted to, so the two
 * HR sentences that must read identically ("unreachable" and "does not exist")
 * still do. `canRequest: false` keeps the panel off even if a future caller
 * forgets `requestability`.
 *
 * The empty `token` is deliberate: this refusal addresses NO record. Passing a
 * real HR token here would ask `access_denied_context` about a row, and its
 * honest answer names the row — which is precisely the leak.
 */
const HR_ABSOLUTE_CONTEXT: AccessDeniedContext = {
  status: "denied",
  disclosure: "none",
  level: "none",
  isOwner: false,
  entity: { token: "", label: "", title: null },
  owner: null,
  organization: null,
  ancestor: null,
  request: null,
  canRequest: false,
};

export interface HrAccessDeniedProps {
  /** HR's own worded reason. The platform frame never invents one. */
  sentence: string;
  /** Where "back to what you can see" goes for this persona. */
  fallbackHref: string;
  fallbackLabel: string;
  /**
   * The employer a link named that this person has no standing in — a uuid or a
   * slug, straight from `?org=`. Present ⇒ this refusal is REQUESTABLE against
   * that organization and the canonical Request-access panel renders. Absent ⇒
   * absolute. See the header: this is the only requestable HR class today.
   */
  employerRef?: string | null;
  /**
   * HR's own trailing disclosure — the "Refusal reference" `<details>` holding a
   * reason code and an audit id. The frame has no idea these exist; HR earned
   * them and does not give them up by moving into the frame.
   */
  footer?: ReactNode;
}

/**
 * HR's refusal, rendered through the canonical access-denied primitive.
 */
export function HrAccessDenied({
  sentence,
  fallbackHref,
  fallbackLabel,
  employerRef,
  footer,
}: HrAccessDeniedProps) {
  if (employerRef?.trim()) {
    return (
      <HrEmployerStandingDenied
        employerRef={employerRef.trim()}
        sentence={sentence}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
        footer={footer}
      />
    );
  }

  return (
    <AccessDeniedView
      context={HR_ABSOLUTE_CONTEXT}
      id=""
      requestability="absolute"
      reason={sentence}
      footer={footer}
      fallbackHref={fallbackHref}
      fallbackLabel={fallbackLabel}
      onChanged={NOOP}
    />
  );
}

function NOOP() {}

/**
 * The SMS-deep-link case the owner hit: signed in, real account, and no standing
 * whatsoever in the employer the link named.
 *
 * This one is REQUESTABLE, and it is the only HR refusal that is. The target is
 * the ORGANIZATION, not an HR record — so `access_denied_context` names the
 * employer honestly (organizations carry `allow_preview = true`), and
 * `access_request_create` routes the ask to that organization's owners and
 * admins, who land it in their `/settings/access-requests` inbox. No HR record
 * is named, asked about, or confirmed to exist anywhere in this path.
 *
 * ⚠️ Granting the ask writes an ordinary `iam.permissions` row on the
 * organization. That reaches the right humans, but it does NOT by itself create
 * HR standing (`hr.role_assignment` / an employment does). The ask is a
 * conversation with the right people, not a self-serve HR grant — see
 * SPEC-UI-IA §1's refusal law.
 *
 * `[orgId]` and `?org=` both accept a slug, and the gate is keyed on the uuid,
 * so a slug goes through `access_gate_resolve_slug` exactly as
 * `OrganizationAccessGate` does. A slug the platform will not resolve for this
 * account falls back to the absolute frame — never upgraded to "doesn't exist".
 */
function HrEmployerStandingDenied({
  employerRef,
  sentence,
  fallbackHref,
  fallbackLabel,
  footer,
}: {
  employerRef: string;
  sentence: string;
  fallbackHref: string;
  fallbackLabel: string;
  footer?: ReactNode;
}) {
  const directId = UUID_RE.test(employerRef) ? employerRef : null;

  const [slugResolved, setSlugResolved] = useState<{
    slug: string;
    id: string | null;
  } | null>(null);

  useEffect(() => {
    if (directId) return;
    let active = true;
    void resolveAccessGateSlug("organization", employerRef).then((resolved) => {
      if (active) setSlugResolved({ slug: employerRef, id: resolved });
    });
    return () => {
      active = false;
    };
  }, [directId, employerRef]);

  const id =
    directId ??
    (slugResolved && slugResolved.slug === employerRef
      ? slugResolved.id
      : null);

  if (id) {
    return (
      <AccessGate
        token="organization"
        id={id}
        requestability="requestable"
        reason={sentence}
        footer={footer}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
      />
    );
  }

  // Still asking the platform about the slug. Render nothing rather than flash
  // the absolute frame at somebody who is about to get the full gate.
  if (!directId && (!slugResolved || slugResolved.slug !== employerRef)) {
    return null;
  }

  return (
    <AccessDeniedView
      context={HR_ABSOLUTE_CONTEXT}
      id=""
      requestability="absolute"
      reason={sentence}
      footer={footer}
      fallbackHref={fallbackHref}
      fallbackLabel={fallbackLabel}
      onChanged={NOOP}
    />
  );
}
