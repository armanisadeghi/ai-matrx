"use client";

// features/connectors/ConnectorConsentDialog.tsx
//
// "CHOOSE WHAT TO CONNECT" — the consent dialog, and the same body reused as a
// page in Settings → Connectors. Generic: one provider config in, no provider
// named anywhere below this file.
//
// Champion (PLAN §1/§2): the ChatGPT/Codex connectors dialog — per-product rows
// with toggles and one install button. Matched, then beaten on four counts:
//   1. every row says in ONE plain sentence exactly what AI Matrx will be able
//      to do, including the boundary ("We never read your inbox"), with the
//      provider's own scope string behind an info affordance — the person sees
//      both, and neither stands in for the other;
//   2. only the switched-on products' scopes are requested, and a later switch
//      adds only its own (the hub refuses anything wider, and refuses anything
//      that would drop an existing grant — so picked files survive);
//   3. a row still behind our rollout gate shows its sentence, NO toggle, and
//      "Turns on automatically when ready for your account" — driven by the
//      server capability catalog, never a client constant;
//   4. the result is read back per row from the account the server left, so one
//      product being refused never hides the ones that landed.
//
// Mobile: the base `DialogContent` converts itself to a bottom sheet under
// 768px (see the `ios-mobile-first` skill), so there is no second layout here
// and no `useIsMobile` branch to drift.

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationGatedControl } from "@/features/organizations/useOrganizationGatedControl";
import { selectOrganizationsList } from "@/features/scopes/redux/selectors/tree";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { isGoogleAuthorizationCancelled } from "@/providers/google-provider/GoogleApiProvider";
import { ConnectorMark } from "./ConnectorMark";
import { getConnector } from "./registry";
import {
  productsInGroup,
  type ConnectorFirstActionContextKey,
  type ConnectorProduct,
  type ConnectorProviderConfig,
} from "./provider-config";
import {
  accountHealth,
  preferredAccountId,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
  type ConnectorProductHealth,
} from "./health";
import { ProductPermissionsDisclosure } from "./ProductPermissions";
import {
  buildConsentPlan,
  consentOutcomes,
  emptyPlanAnswer,
  type ConsentOutcome,
  type ConsentPlan,
  type ConsentRequest,
} from "./consent-plan";
import {
  consentFailureAnswer,
  useGoogleConnectorState,
  useGoogleConsentRunner,
  type ConsentFailureAnswer,
} from "./google-adapter";
import { ConsentFailureNotice } from "./ConsentFailureNotice";
import { GOOGLE_CONNECTOR_PROVIDER } from "./provider-config";
import { confirmGmailChangesDisclosure, confirmGmailReadDisclosure } from "./gmail-read-disclosure";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** The sentinel account id meaning "a Google login not connected here yet". */
const NEW_ACCOUNT = "__new_account__";

/**
 * The line under the button, which must describe the request that is actually
 * about to be made. A RENEWAL is not "nothing you already granted is asked for
 * again" — it is precisely a fresh approval of what is already granted, because
 * the provider stopped honouring the old grant. Saying otherwise on the one
 * screen a person reaches from "Not working" would tell them their press cannot
 * fix the thing it is there to fix.
 */
export function consentRequestSentence(
  providerName: string,
  request: ConsentRequest,
): string {
  const label =
    request.products.length === 1
      ? (request.products[0]?.name ?? "one product")
      : `${request.products.length} products`;
  if (request.renewals.length === 0) {
    return `${providerName} will ask you to approve ${label}. Nothing you already granted is asked for again.`;
  }
  if (request.addedScopes.length === 0) {
    return `${providerName} will ask you to approve ${label} again, which renews the access it stopped honouring. Nothing new is asked for.`;
  }
  return `${providerName} will ask you to approve ${label}. That renews ${request.renewals
    .map((product) => product.name)
    .join(", ")} and adds what you switched on — nothing else you already granted changes.`;
}

/** Rows the person has already granted start switched on, and stay on. */
function initialSelection(health: readonly ConnectorProductHealth[]): string[] {
  return health
    .filter(
      (row) =>
        row.state === "connected" ||
        row.state === "scope_missing" ||
        // A product the provider is currently REFUSING is still one this
        // account has; starting it switched off would read as "you never
        // connected this", which is the opposite of what happened.
        row.state === "refused" ||
        // Same for an account whose CREDENTIAL is dead: every product it holds
        // is broken and every one of them is renewed by the one approval this
        // press makes. Leaving these off is how the dialog answered "nothing is
        // switched on yet" on the one screen that could repair the account
        // (VERIFY-U-P2-R2, N2).
        row.state === "account_unusable",
    )
    // A BLOCKED row is deliberately absent: nothing can be asked for it, so
    // switching it on would build a request the provider must refuse (V17-1).
    .map((row) => row.product.key);
}

/**
 * THE "A DIFFERENT ACCOUNT" COPY, in one place per line, because it makes a
 * promise about what the SERVER will do. The hub resolves the row it is about to
 * write by provider subject and owner and upserts it, so signing in with an
 * identity this owner already has connected REFRESHES that account — it does not
 * add a second one. The old line said "it becomes a second connected account",
 * which was false in exactly the case a person is most likely to hit: picking
 * the account they were already using (VERIFY-U-P2-R2, N5).
 */
export function newAccountChoiceDescription(providerName: string): string {
  return `${providerName} asks you to sign in. A login that is new here is added as its own account; one that is already connected here is refreshed instead.`;
}

/** The footnote under the switcher when no account is selected yet. */
export function newAccountFootnote(providerName: string): string {
  return `Nothing you have already connected changes. A ${providerName} login that is new here becomes its own account; if you sign in with one that is already connected here, that account is refreshed instead — unless you switch it on for your organization below, which is its own account.`;
}

/**
 * The one-line summary beside an account in the switcher: what it actually has.
 *
 * 🚨 EXPORTED, AND RENDERED ABOVE THE ROWS TOO (VERIFY-U-P2-R5, V17-3). This
 * sentence was built correctly and shown ONLY inside the account `Select`'s item
 * list — which is closed, and which a person with one account never opens. So the
 * dialog a person reaches from a row reading "Needs reconnecting" said
 * "Needs reconnecting" zero times, every one of the nine broken rows read exactly
 * like a row nobody had ever connected, and the line above them promised
 * "Nothing it already has is asked for again" while the footer under the button
 * said it would approve nine products again. The words existed; the person could
 * not reach them.
 */
export function accountSummary(
  provider: ConnectorProviderConfig,
  account: ConnectorAccount,
  rollout: readonly ConnectorCapabilityRollout[],
): string {
  const rows = accountHealth({ provider, account, rollout });
  const live = rows
    .filter((row) => row.state === "connected")
    .map((row) => row.product.name);
  // Blocked outranks everything: no product works and nothing here repairs it,
  // so the switcher must not offer the renewal sentence below (V17-1).
  if (account.blocked) {
    const held = rows.filter((row) => row.state === "unavailable").length;
    return `Blocked — ${held} product${held === 1 ? "" : "s"} it already has cannot be used, and approving again would not help`;
  }
  // A dead credential holds its grant and can use none of it. "Nothing
  // connected on this account yet" would read as "you never set this up", which
  // is the opposite of what happened (the N2 shape, in the switcher).
  if (!account.usable) {
    const held = rows.filter((row) => row.state === "account_unusable").length;
    return held === 0
      ? "Needs reconnecting"
      : `Needs reconnecting — ${held} product${held === 1 ? "" : "s"} it already has cannot be used`;
  }
  if (live.length === 0) return "Nothing connected on this account yet";
  return live.join(", ");
}

function ProductRow({
  provider,
  health,
  selected,
  outcome,
  onToggle,
  busy,
  anchorId,
}: {
  provider: ConnectorProviderConfig;
  health: ConnectorProductHealth;
  selected: boolean;
  outcome: ConsentOutcome | null;
  onToggle: (next: boolean) => void;
  busy: boolean;
  anchorId?: string;
}) {
  const Icon = health.product.icon;
  const gated = health.state === "pending_rollout";
  /** Blocked: no toggle at all, because no request could succeed (V17-1). */
  const blocked = health.state === "unavailable";
  return (
    <div id={anchorId} tabIndex={anchorId ? -1 : undefined} className="scroll-mt-20 flex items-start gap-2 border-b border-border/60 px-1 py-2.5 outline-none last:border-b-0 focus:ring-2 focus:ring-primary sm:gap-2.5 sm:px-3">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          gated ? "text-muted-foreground/60" : "text-foreground/70",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {health.product.name}
          </span>
          {health.state === "connected" ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-success/15 px-1.5 text-[10px] font-medium text-success">
              <Check className="h-2.5 w-2.5" aria-hidden />
              Connected
            </span>
          ) : health.state === "scope_missing" ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
              Partly connected
            </span>
          ) : health.state === "refused" ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
              Not working
            </span>
          ) : /* 🚨 THE TWO STATES THIS ROW RENDERED AS "never connected" (V17-3,
                V17-1). A product the account HOLDS and cannot use is not a blank
                row: with the credential dead every one of the nine rows read
                exactly like a row nobody had ever switched on, on the one screen
                a person reaches to repair it. */
          health.state === "account_unusable" ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
              Needs reconnecting
            </span>
          ) : health.state === "unavailable" ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive">
              <Ban className="h-2.5 w-2.5" aria-hidden />
              Blocked
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {health.product.promise}
        </p>
        {gated ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            {health.reason}
          </p>
        ) : null}
        {/* A row the provider is REFUSING carried only its promise, so the badge
            said "Not working" and nothing on the screen said what was wrong or
            what the press would do about it. The server's own sentence goes
            here, and a switched-on row says plainly that approving again renews
            the grant — never that it is already connected.
            🚨 That "renews it" line is true ONLY when the disposition is
            `reconnect` (a fresh approval is what clears it) — `health.remedy`
            is non-null exactly then (`productHealth` in health.ts). A
            `share_required` refusal (a different Google identity must share
            the item) or an `ours` refusal (our own configuration mistake) is
            not fixed by approving again, so this row must not promise that
            (Cursor Bugbot round 13, PR 228, comment 4041550778). */}
        {health.state === "refused" ? (
          <p className="mt-1 text-xs leading-snug text-warning">
            {health.reason}
            {selected && health.remedy
              ? ` Approving ${provider.name} again renews it — nothing new is asked for.`
              : ""}
          </p>
        ) : health.state === "account_unusable" ? (
          /* The account's own sentence, on the row it broke, with what the press
             will do about it — the same promise the footer makes (V17-3). */
          <p className="mt-1 text-xs leading-snug text-destructive">
            {health.reason}
            {selected
              ? ` Approving ${provider.name} again renews it — nothing new is asked for.`
              : ""}
          </p>
        ) : health.state === "unavailable" ? (
          <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-destructive">
            <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              {health.reason}
              {health.remedy ? ` ${health.remedy}` : ""}
            </span>
          </p>
        ) : null}
        {outcome ? (
          <p
            className={cn(
              "mt-1 text-xs",
              outcome.state === "granted" || outcome.state === "already_granted"
                ? "text-success"
                : "text-destructive",
            )}
          >
            {outcome.state === "granted" ? "Connected." : outcome.message}
          </p>
        ) : null}

        {/* D1: a REAL disclosure, not a hover-only tooltip. `showActivity` is
            off here — nothing has run yet on a row nobody has approved. */}
        <ProductPermissionsDisclosure
          providerName={provider.name}
          health={health}
          showActivity={false}
          closedLabel={`What ${provider.name} is asked for`}
          openLabel="Hide what is asked for"
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {gated || blocked ? null : (
          <Switch
            checked={selected}
            disabled={busy || health.state === "connected"}
            onCheckedChange={onToggle}
            aria-label={`${selected ? "Do not connect" : "Connect"} ${health.product.name}`}
            title={
              health.state === "connected"
                ? `${health.product.name} is connected. Disconnect the account in Settings → Connectors to remove it.`
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

export interface ConnectorConsentBodyProps {
  provider: ConnectorProviderConfig;
  accounts: readonly ConnectorAccount[];
  rollout: readonly ConnectorCapabilityRollout[];
  isLoading: boolean;
  rolloutUnavailable: boolean;
  errorMessage: string | null;
  refetch: () => Promise<unknown>;
  /** Seed the account being added to; defaults to the first usable one. */
  initialAccountId?: string | null;
  /** Pre-switch-on these rows (a surface that knows what the person is using). */
  initialProductKeys?: readonly string[];
  /** Stable anchors for Settings search; omitted inside the dialog. */
  rowAnchorPrefix?: string;
  searchFocus?: { productKey: string; request: number } | null;
  onDone?: () => void;
}

/**
 * The values a `ConnectorFirstActionContextKey` resolves to from the dialog's
 * own scope — the SAME data the typed opener for that overlay would pass
 * (e.g. `TasksHeaderControls`' `useOpenGoogleTasksImport({ organizationId })`).
 * Extend this alongside the key union in `provider-config.ts`.
 */
interface ConnectorFirstActionContext {
  organizationId: string | null;
}

/**
 * Builds the overlay `data` an action's `needs` declares, and names every key
 * whose value is unavailable right now. `undefined`/`null` both count as
 * missing — never write a `null` into the overlay data and let the window
 * decide what that means (Cursor Bugbot thread 4043109495, PR 228).
 */
function resolveFirstActionData(
  needs: readonly ConnectorFirstActionContextKey[] | undefined,
  context: ConnectorFirstActionContext,
): {
  data: Record<string, unknown>;
  missing: readonly ConnectorFirstActionContextKey[];
} {
  const data: Record<string, unknown> = {};
  const missing: ConnectorFirstActionContextKey[] = [];
  for (const key of needs ?? []) {
    const value = context[key];
    if (value == null) {
      missing.push(key);
    } else {
      data[key] = value;
    }
  }
  return { data, missing };
}

/**
 * THE FIRST USEFUL ACTION, whatever shape the product declared it in. A route is
 * a link; a catalogued overlay is a press that opens the window IN PLACE and
 * then steps the dialog aside, because a window opened behind a modal is a
 * control that looks like it did nothing. A row that has nothing to offer yet
 * says so in the config and renders no control — never a dead link.
 *
 * The provider is still not named here: the row carries an overlay id from the
 * platform catalogue, so the next provider's first action is a config row.
 *
 * 🚨 An overlay action's `needs` is checked against `context` BEFORE rendering
 * the button. F-51 gave the Tasks row an overlay id and nothing else, so the
 * button dispatched `openOverlay({ overlayId })` with no data, the window's
 * `organizationId` prop came back `null`, and the body it opened could not
 * load (lane F-55). A button whose needs cannot be met right now is absent,
 * not present-and-dead (Law 4) — the row still shows the "Connected" state and
 * its permissions disclosure; only the dead-end control disappears.
 */
function FirstAction({
  product,
  context,
  onOpened,
}: {
  product: ConnectorProduct;
  context: ConnectorFirstActionContext;
  onOpened?: () => void;
}) {
  const dispatch = useAppDispatch();
  // Called unconditionally, above every early return — the rules of hooks, and
  // the gate's sentence is what the disabled branch below renders.
  const organizationGate = useOrganizationGatedControl(
    `opening ${product.name.toLowerCase()}`,
  );
  const action = product.firstAction;
  if (action.kind === "none") return null;
  if (action.kind === "route") {
    return (
      <Link
        href={action.href}
        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
      >
        {action.label}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </Link>
    );
  }
  const { data, missing } = resolveFirstActionData(action.needs, context);
  // 🚨 THREE STATES, NOT "ABSENT OR THERE" (VERIFY-R7-FIX-WAVE NEW-1).
  // `missing` is derived from the ambient organization, which is `null` both
  // while boot is resolving and when boot has settled with nothing — so the
  // one door out of a consent that just SUCCEEDED simply vanished for the
  // several seconds every cold load takes to answer, with nothing on screen
  // saying it was coming. Absence is honest only for the terminal state; the
  // resolving beat is a control that says it is checking.
  const needsOrganization = (action.needs ?? []).includes("organizationId");
  if (missing.length > 0 && !(needsOrganization && missing.length === 1)) return null;
  if (missing.length > 0) {
    // THE REMEDY IS THE PRESS (V-24 NEW-3). While the answer is still coming and
    // once it has settled with nothing, this control is disabled and says which
    // of the two it is. When the READ FAILED it stays pressable, because its own
    // sentence ends "Press to try again." — and this is the button that does it.
    return (
      <button
        type="button"
        data-connector-first-action={product.key}
        disabled={organizationGate.disabled}
        title={organizationGate.title}
        onClick={organizationGate.press(() => {})}
        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-muted-foreground"
      >
        {action.label}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      data-connector-first-action={product.key}
      onClick={() => {
        dispatch(
          openOverlay(
            Object.keys(data).length > 0
              ? { overlayId: action.overlayId, data }
              : { overlayId: action.overlayId },
          ),
        );
        onOpened?.();
      }}
      className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
    >
      {action.label}
      <ChevronRight className="h-3 w-3" aria-hidden />
    </button>
  );
}

/**
 * The dialog's body. Mounted in the dialog AND as the Settings page content —
 * one component, two mounts (PLAN §2), so the two can never drift.
 */
export function ConnectorConsentBody({
  provider,
  accounts,
  rollout,
  isLoading,
  rolloutUnavailable,
  errorMessage,
  refetch,
  initialAccountId,
  initialProductKeys,
  rowAnchorPrefix,
  searchFocus,
  onDone,
}: ConnectorConsentBodyProps) {
  const organizations = useAppSelector(selectOrganizationsList);
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  // The organization a first action's window writes into — the same value
  // the typed openers pass (`TasksHeaderControls`' `selectOrganizationId`).
  // Never a personal-workspace fallback: with none selected, `needs` above
  // marks the key missing and the row's first-action control is absent
  // (Law 4 — honest absence, never a dead press).
  const firstActionContext: ConnectorFirstActionContext = {
    organizationId: activeOrganizationId,
  };
  const runner = useGoogleConsentRunner();

  // D7: never "the first row the inventory returned" — the account this
  // surface is using, else the one holding the most live products.
  // The dialog may mount while inventory is loading. Preserve a caller's exact
  // account ID before that inventory exists; otherwise the first render picks
  // NEW_ACCOUNT and a later consent can silently target a different identity.
  // Without a caller target, derive the default from the current inventory
  // until the person explicitly chooses an account.
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(
    () => initialAccountId ?? null,
  );
  const accountId = chosenAccountId ?? preferredAccountId({
    provider,
    accounts,
    rollout,
  }) ?? NEW_ACCOUNT;
  const account = accounts.find((row) => row.id === accountId) ?? null;
  const health = accountHealth({ provider, account, rollout });

  const [selected, setSelected] = useState<string[]>(() => [
    ...new Set([
      ...initialSelection(health),
      ...(initialProductKeys ?? []),
    ]),
  ]);
  // Inventory often arrives after this body mounts. Seed the existing grants
  // exactly once when its initial account first appears, unless the person has
  // already made a choice. A later refresh must never overwrite their toggles.
  const selectionReady = useRef(Boolean(account));
  useEffect(() => {
    if (selectionReady.current || !account) return;
    selectionReady.current = true;
    setSelected([...new Set([...initialSelection(health), ...(initialProductKeys ?? [])])]);
  }, [account, health, initialProductKeys]);
  const [busy, setBusy] = useState(false);
  /** True once a consent has been attempted — per-row results only exist after. */
  const [attempted, setAttempted] = useState(false);
  /**
   * Did the last attempt's exchange COMPLETE? Per-row outcomes cannot be read
   * off the account's scopes alone, because a renewal's scopes were already
   * there (N10). Reset with every change of selection or account.
   */
  const [exchangeCompleted, setExchangeCompleted] = useState(false);
  /** Keep the request that actually ran; a refreshed account makes a new plan. */
  const [attemptPlan, setAttemptPlan] = useState<ConsentPlan | null>(null);
  /** A first connection has no selected account until the exchange returns it. */
  const [attemptAccountId, setAttemptAccountId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ConsentFailureAnswer | null>(null);
  /**
   * D8: the answer a press gets when the press would do nothing. The button
   * stays pressable (see the footer) and says why, instead of sitting there
   * disabled with no way to ask what is wrong.
   */
  const [answer, setAnswer] = useState<string | null>(null);

  const activeOrganization =
    organizations.find((org) => org.id === activeOrganizationId) ?? null;
  const mayConnectForOrganization =
    activeOrganization?.role === "owner" || activeOrganization?.role === "admin";
  const [forOrganization, setForOrganization] = useState(false);
  const gmailChangesSelected = selected.includes("gmail_modify");

  const plan = buildConsentPlan({
    provider,
    selectedProductKeys: selected,
    account,
    rollout,
  });
  const focusGroup = provider.products.find(
    (product) => product.key === searchFocus?.productKey,
  )?.group;
  useEffect(() => {
    if (!searchFocus || !rowAnchorPrefix || !focusGroup) return;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(
        `${rowAnchorPrefix}${searchFocus.productKey}`,
      );
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusGroup, rowAnchorPrefix, searchFocus]);

  /**
   * D4: switching account — including to "a different Google account" — changes
   * what is already granted, so the switched-on rows are recomputed for the
   * account now being connected instead of carrying the last one's answers.
   */
  const chooseAccount = (nextId: string) => {
    selectionReady.current = true;
    setChosenAccountId(nextId);
    setAttempted(false);
    setExchangeCompleted(false);
    setAttemptPlan(null);
    setAttemptAccountId(null);
    setFailure(null);
    setAnswer(null);
    const nextAccount = accounts.find((row) => row.id === nextId) ?? null;
    setSelected([
      ...new Set([
        ...initialSelection(accountHealth({ provider, account: nextAccount, rollout })),
        ...(initialProductKeys ?? []),
      ]),
    ]);
  };

  const toggle = (product: ConnectorProduct, next: boolean) => {
    selectionReady.current = true;
    setAttempted(false);
    setExchangeCompleted(false);
    setAttemptPlan(null);
    setAttemptAccountId(null);
    setFailure(null);
    setAnswer(null);
    setSelected((current) =>
      next
        ? [...new Set([...current, product.key])]
        : current.filter((key) => key !== product.key),
    );
  };

  const connect = async () => {
    if (initialAccountId && accountId === initialAccountId && !account) {
      const sentence = "The selected Google account is no longer available. Choose another account or reopen this connection.";
      setAnswer(sentence);
      toast.info(sentence);
      return;
    }
    if (gmailChangesSelected && account?.ownerKind === "organization") {
      const sentence = "Gmail changes can connect only to a personal Google account. Choose your own account or connect a different one.";
      setAnswer(sentence);
      toast.info(sentence);
      return;
    }
    if (!plan.request) {
      // The press is never swallowed: it says, in words, why there is nothing
      // to send to the provider — inline for the person reading the dialog and
      // in a toast for the person who was watching the button.
      const sentence = emptyPlanAnswer(plan, selected.length);
      setAnswer(sentence);
      toast.info(sentence);
      return;
    }
    setAnswer(null);
    setBusy(true);
    setFailure(null);
    try {
      const disclosed = await confirmGmailReadDisclosure(plan.request);
      if (!disclosed) return;
      const changesDisclosed = await confirmGmailChangesDisclosure(plan.request);
      if (!changesDisclosed) return;
      const result = await runner.run(plan.request, {
        owner:
          !gmailChangesSelected && forOrganization && activeOrganization
            ? { type: "organization", organizationId: activeOrganization.id }
            : { type: "user" },
        loginHint: account?.label ?? null,
      });
      setAttemptPlan(plan);
      setAttemptAccountId(result.connectionId);
      setChosenAccountId(result.connectionId);
      setExchangeCompleted(true);
      setAttempted(true);
      await refetch();
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        toast.info(`${provider.name} authorization cancelled — nothing changed.`);
        setBusy(false);
        return;
      }
      // ONE translation for every press failure: a sentence written for the
      // person, with the server's own words behind the details control and never
      // inline — a code or a capability key on this screen is the leak N4 found.
      setFailure(consentFailureAnswer(cause));
      // Read the account back anyway: a partial grant must not be invisible.
      // But the exchange did NOT complete, and no row may call itself granted on
      // the strength of scopes a renewal already had (N10).
      setExchangeCompleted(false);
      setAttemptPlan(plan);
      setAttemptAccountId(account?.id ?? null);
      setAttempted(true);
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  // Outcomes are derived from the account as it is NOW, so they recompute for
  // free after the refetch above — no stored copy of a result to go stale, and
  // nothing to show before the person has actually pressed the button.
  const resultAccount = accounts.find((row) => row.id === attemptAccountId) ?? null;
  const resultAccountUnavailable =
    attempted && !busy && exchangeCompleted && !resultAccount;
  const resultRows: ConsentOutcome[] | null =
    attempted && !busy && attemptPlan && (!exchangeCompleted || resultAccount)
      ? consentOutcomes({
          provider,
          plan: attemptPlan,
          account: resultAccount,
          rollout,
          exchange: { completed: exchangeCompleted },
        })
      : null;
  const grantedRows = resultRows?.filter((row) => row.state === "granted") ?? [];
  const hasGrantedResult = grantedRows.length > 0;
  useEffect(() => {
    if (hasGrantedResult) toast.success(`${provider.name} connected.`);
  }, [hasGrantedResult, provider.name]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Checking your {provider.name} account…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}{" "}
            <button
              type="button"
              onClick={() => void refetch()}
              className="underline underline-offset-2"
            >
              Try again
            </button>
            <ErrorAlchemyMenu className="ml-auto" />
          </div>
        ) : null}

        {rolloutUnavailable ? (
          <div
            role="status"
            className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            We could not reach {provider.name}&apos;s availability list, so no row
            can be switched on right now. Nothing you have connected is affected.
            <ErrorAlchemyMenu />
          </div>
        ) : null}

        {/* D4 + D7 — WHICH GOOGLE ACCOUNT THIS CONSENT LANDS ON.
            PLAN §2: "Connecting as arman@…, change", and "a different Google
            login is its own account". Before this the line was
            a full stop with no control, and every consent the dialog could
            start added to an account that already existed — there was no way to
            bring a second Google identity in at all. The alternatives were also
            a run of raw emails with nothing to tell them apart; a select with
            the email AND what that account actually holds is the change. */}
        <div className="flex flex-wrap items-center gap-2 px-0.5">
          <label
            htmlFor="connector-consent-account"
            className="text-xs text-muted-foreground"
          >
            Connecting as
          </label>
          {accounts.length === 0 ? (
            <span className="text-xs font-medium text-foreground">
              a {provider.name} account you choose next — {provider.name} asks
              you to sign in.
            </span>
          ) : (
            <Select value={accountId} onValueChange={chooseAccount}>
              <SelectTrigger
                id="connector-consent-account"
                className="h-11 w-full min-w-0 text-sm sm:h-8 sm:w-auto sm:min-w-[16rem]"
                aria-label={`Change which ${provider.name} account this connects`}
              >
                <SelectValue placeholder={`Choose a ${provider.name} account`} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((row) => (
                  <SelectItem
                    key={row.id}
                    value={row.id}
                    description={accountSummary(provider, row, rollout)}
                  >
                    {row.label}
                  </SelectItem>
                ))}
                <SelectItem
                  value={NEW_ACCOUNT}
                  description={newAccountChoiceDescription(provider.name)}
                >
                  Use a different {provider.name} account
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {/* 🚨 THE ACCOUNT'S OWN TRUTH, ABOVE THE ROWS, WHERE A PERSON READS IT
              (V17-3). This line always said "Nothing it already has is asked for
              again" — which is exactly backwards for an account whose credential
              is dead (the press renews all nine) and for one that is blocked
              (nothing can be asked for at all), and it sat directly above rows
              that looked unconnected and a footer that said nine products would
              be approved again. `accountSummary` is the same sentence the
              switcher shows; it is no longer only reachable by opening a closed
              `Select`. */}
          <p
            className={cn(
              "w-full text-xs",
              account && !account.usable
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {!account
              ? newAccountFootnote(provider.name)
              : account.blocked
                ? `${accountSummary(provider, account, rollout)}.`
                : !account.usable
                  ? `${accountSummary(provider, account, rollout)}. Approving ${provider.name} again renews what it already has — nothing new is asked for.`
                  : "Switching on another product adds it to this account. Nothing it already has is asked for again."}
          </p>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {provider.groups.map((group) => {
            const products = productsInGroup(provider, group.key);
            if (products.length === 0) return null;
            return (
              /* D5 — a REAL disclosure per group (PLAN §2: "Two groups, each
                 collapsible"). Open by default, because the dialog's job is to
                 show what is on offer; collapsible because nine rows and two
                 headers is a long scroll on a phone. Radix `Collapsible` gives
                 the button semantics, `aria-expanded` and Enter/Space for
                 free — a hand-rolled div would not. */
              /* A search jump remounts only its group open, even if the person
                 collapsed it earlier. Selection lives above these rows. */
              <Collapsible
                key={`${group.key}-${group.key === focusGroup ? searchFocus?.request ?? 0 : 0}`}
                defaultOpen
              >
                <CollapsibleTrigger className="group mb-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:min-h-0">
                  <span className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
                        aria-hidden
                      />
                      <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </span>
                    </span>
                    <span className="pl-5 text-xs text-muted-foreground/80 sm:hidden">
                      {group.hint}
                    </span>
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground/80 sm:inline">
                    {group.hint}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-hidden border-y border-border sm:rounded-lg sm:border sm:bg-card">
                    {products.map((product) => {
                      const row = health.find(
                        (candidate) => candidate.product.key === product.key,
                      );
                      if (!row) return null;
                      return (
                        <ProductRow
                          key={product.key}
                          provider={provider}
                          health={row}
                          selected={selected.includes(product.key)}
                          outcome={
                            resultRows?.find(
                              (outcome) => outcome.product.key === product.key,
                            ) ?? null
                          }
                          onToggle={(next) => toggle(product, next)}
                          busy={busy}
                          anchorId={rowAnchorPrefix ? `${rowAnchorPrefix}${product.key}` : undefined}
                        />
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {gmailChangesSelected ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            Gmail changes connect only to your personal Google account. Choose your own account or connect a different one.
          </p>
        ) : mayConnectForOrganization && activeOrganization ? (
          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Switch
              checked={forOrganization}
              disabled={busy}
              onCheckedChange={setForOrganization}
              aria-label={`Connect for ${activeOrganization.name}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                Connect for {activeOrganization.name}, so my team can use it
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The connection belongs to {activeOrganization.name} instead of
                just you. Leave it off and it stays yours.
              </span>
            </span>
          </label>
        ) : null}

        {plan.blocked.length > 0 ? (
          <ul className="space-y-1 px-0.5">
            {plan.blocked.map((block) => (
              <li key={block.productKey} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {block.productName}
                </span>{" "}
                — {block.reason}
              </li>
            ))}
          </ul>
        ) : null}

        {failure ? <ConsentFailureNotice failure={failure} /> : null}

        {resultAccountUnavailable ? (
          <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            {provider.name} approval finished, but we could not confirm this account in your connections. Refresh Settings → Connectors before trying again.
            <ErrorAlchemyMenu />
          </p>
        ) : null}

        {hasGrantedResult ? (
          <div className="rounded-lg border border-success/30 bg-success/[0.06] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              Ready to use
            </p>
            <ul className="mt-1 space-y-1">
              {grantedRows.map((row) => (
                  <li
                    key={row.product.key}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-muted-foreground">
                      {row.product.name}
                    </span>
                    <FirstAction
                      product={row.product}
                      context={firstActionContext}
                      onOpened={onDone}
                    />
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          {onDone ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDone}
              disabled={busy}
              className="h-11 w-full text-sm sm:h-8 sm:w-auto"
            >
              {hasGrantedResult
                ? "Done"
                : "Not now"}
            </Button>
          ) : null}
          {/* D8 — THE PRESS ALWAYS ANSWERS. A disabled primary is the one
              control a person cannot interrogate: on a phone there is no hover,
              no title, no tooltip, so "why can't I press this?" has no answer on
              the screen. Apple's and Slack's consent sheets keep the primary
              action live and answer the press, and our own law is explicit —
              "a click that would silently do nothing says so". So the button is
              disabled ONLY while the provider window is open or its script is
              still loading (pressing then would genuinely double-fire), and an
              empty selection is answered in words, inline and in a toast. */}
          <Button
            size="sm"
            onClick={() => void connect()}
            disabled={busy || !runner.ready}
            className="h-11 w-full text-sm sm:h-8 sm:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                Waiting for {provider.name}…
              </>
            ) : !runner.ready ? (
              `Loading ${provider.name}…`
            ) : (
              provider.dialog.cta
            )}
          </Button>
        </div>
        {answer ? (
          <p role="status" className="text-right text-xs text-warning">
            {answer}
          </p>
        ) : plan.empty && !busy ? (
          <p className="text-right text-xs text-muted-foreground">
            {emptyPlanAnswer(plan, selected.length)}
          </p>
        ) : plan.request ? (
          <p className="text-right text-xs text-muted-foreground">
            {consentRequestSentence(provider.name, plan.request)}
          </p>
        ) : null}
      </div>
  );
}

export interface ConnectorConsentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialConnectionId?: string | null;
  initialProductKeys?: readonly string[];
}

/**
 * The overlay. The provider is Google today; when the second provider lands,
 * the overlay takes a provider id in its data and resolves the config + adapter
 * from a registry — the body below does not change.
 */
export function ConnectorConsentDialog({
  isOpen,
  onClose,
  initialConnectionId,
  initialProductKeys,
}: ConnectorConsentDialogProps) {
  const provider = GOOGLE_CONNECTOR_PROVIDER;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="flex max-h-[90dvh] w-full flex-col overflow-hidden sm:max-w-[36rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ConnectorMarkSlot provider={provider} />
            {provider.dialog.title}
          </DialogTitle>
          <DialogDescription>{provider.dialog.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
          <LazyGoogleAPIProvider>
            <ConnectorConsentDialogBody
              provider={provider}
              initialConnectionId={initialConnectionId ?? null}
              initialProductKeys={initialProductKeys}
              onDone={onClose}
            />
          </LazyGoogleAPIProvider>
        </div>
        <DialogFooter className="sr-only" />
      </DialogContent>
    </Dialog>
  );
}

function ConnectorMarkSlot({
  provider,
}: {
  provider: ConnectorProviderConfig;
}) {
  const connector = getConnector(provider.markConnectorId);
  if (!connector) return null;
  return <ConnectorMark connector={connector} className="h-4 w-4" />;
}

/**
 * The provider-state wiring, kept separate so the body stays pure props. Today
 * there is one adapter; a second provider adds a branch HERE and nowhere else.
 */
export function ConnectorConsentDialogBody({
  provider,
  initialConnectionId,
  initialProductKeys,
  onDone,
}: {
  provider: ConnectorProviderConfig;
  initialConnectionId?: string | null;
  initialProductKeys?: readonly string[];
  onDone?: () => void;
}) {
  const state = useGoogleConnectorState();
  return (
    <ConnectorConsentBody
      provider={provider}
      accounts={state.accounts}
      rollout={state.rollout}
      isLoading={state.isLoading}
      rolloutUnavailable={state.rolloutUnavailable}
      errorMessage={state.errorMessage}
      refetch={state.refetch}
      initialAccountId={initialConnectionId ?? null}
      initialProductKeys={initialProductKeys}
      onDone={onDone}
    />
  );
}

export default ConnectorConsentDialog;
