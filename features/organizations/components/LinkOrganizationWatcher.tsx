"use client";

/**
 * LinkOrganizationWatcher — the IN-SESSION half of "a link names an
 * organization" (lane TAILS-4, 2026-09-21).
 *
 * The cold-boot half lives in `appContextPolicy.remote.fetch`: it passes the
 * URL's `?org=` into `resolveActiveOrgContext` as a rung above this device's
 * remembered choice, which is what stops a person arriving from an email or a
 * text landing on "Select an organization first". That half only runs on a
 * COLD boot (or after `staleAfter`). A link followed while the app is already
 * warm — a notification chip, a client-side navigation, a second link in the
 * same tab — never reaches it, and before this component those links were
 * silently ignored: the destination rendered empty or refused while the person
 * sat in a different organization with no idea why.
 *
 * So this is the same decision, on the same ONE primitive
 * (`lib/organizations/linkOrganization.ts`), applied to every later
 * navigation. It renders nothing.
 *
 * 🚨 STILL NOT A DEFAULT-ORGANIZATION RUNG. It only ever acts on an
 * organization a link NAMED, only after checking it against the live
 * membership list, and it changes nothing at all when the link is absent,
 * malformed, or names an organization this account does not belong to. It is
 * also the reason rule 3 holds: a link inside the organization the person is
 * already working in is `already-current`, which is a no-op with no toast.
 *
 * Mounted globally in `app/DeferredSingletonCore.tsx`, beside
 * `CloudBrowserHandoffDeepLink` — the same shape of problem (a notification's
 * door has to open wherever it lands) and therefore the same shape of answer.
 */

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import {
  LINK_ORGANIZATION_QUERY_KEY,
  decideLinkOrganization,
  readLinkOrganizationParam,
} from "@/lib/organizations/linkOrganization";
import {
  announceLinkOrganizationDecision,
  claimLinkOrganizationDecision,
  readSignedInAs,
  readSwitchWhenALinkAsks,
} from "@/lib/organizations/linkOrganizationSession";
import { whenOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";

function LinkOrganizationWatcherInner(): null {
  const params = useSearchParams();
  const dispatch = useAppDispatch();
  // Read imperatively at decision time: subscribing to the active organization
  // with a selector would re-run this effect on the very switch it performs.
  const store = useAppStore();
  const handledRef = useRef<string | null>(null);

  const raw = params.get(LINK_ORGANIZATION_QUERY_KEY);

  useEffect(() => {
    if (raw === null) return;
    if (handledRef.current === raw) return;
    handledRef.current = raw;

    let cancelled = false;
    void (async () => {
      // Never race the boot answer. If boot is still resolving, IT owns this
      // link (it claims the value below) and deciding here against a
      // half-resolved context would announce a switch that never happened.
      await whenOrgBootstrapResolved();
      if (cancelled) return;
      if (!claimLinkOrganizationDecision(raw)) return;

      const state = store.getState() as {
        appContext?: { organization_id?: string | null; organization_name?: string | null };
        userAuth?: { id?: string | null };
      };
      if (!state.userAuth?.id) return; // a guest has no memberships to check

      // The LIVE membership list. A link can open an organization the person
      // already belongs to; it can never grant one, so this read is the
      // authority and the URL is only a request.
      const { getUserOrganizations } = await import(
        "@/features/organizations/service"
      );
      let memberships: Array<{ id: string; name: string }>;
      try {
        memberships = (await getUserOrganizations()) ?? [];
      } catch (error) {
        // We could not CHECK. Saying "you are not a member" here would be a
        // lie (R37's fourth state), and switching would be worse, so the link
        // simply goes unanswered and the screen keeps its own honest state.
        console.warn(
          "[linkOrganization] could not read memberships to judge a link's organization",
          error,
        );
        return;
      }
      if (cancelled) return;

      const decision = decideLinkOrganization({
        param: readLinkOrganizationParam(
          `?${LINK_ORGANIZATION_QUERY_KEY}=${raw}`,
        ),
        memberships,
        currentOrganizationId: state.appContext?.organization_id ?? null,
        currentOrganizationName: state.appContext?.organization_name ?? null,
        switchWhenALinkAsks: readSwitchWhenALinkAsks(),
        signedInAs: readSignedInAs(),
      });

      if (decision.kind === "honoured") {
        dispatch(
          setOrganization({
            id: decision.organizationId,
            name: decision.organizationName,
          }),
        );
      }
      void announceLinkOrganizationDecision(
        decision,
        (organizationId, organizationName) => {
          dispatch(setOrganization({ id: organizationId, name: organizationName }));
        },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [raw, dispatch, store]);

  return null;
}

export function LinkOrganizationWatcher(): React.ReactElement {
  // `useSearchParams` needs a Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <LinkOrganizationWatcherInner />
    </Suspense>
  );
}

export default LinkOrganizationWatcher;
