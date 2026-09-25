"use client";

// features/connectors/ProductPermissions.tsx
//
// THE ONE PERMISSION DISCLOSURE for a connector product row — the provider's
// own scope strings, what each one lets us do in plain words, the rollout state
// as a sentence, and this product's last successful call and last refusal as
// the server recorded them (its classified code included, as a technical detail
// beside the scope strings — never on the row itself).
//
// 🚨 WHY THIS FILE EXISTS: until 2026-09-17 there were TWO disclosures. The
// health rows had this expander, which works on hover, focus, click and touch
// because it is a real button that toggles real content. The consent dialog had
// a Radix `Tooltip` whose trigger carried no click handler — Radix tooltips open
// on hover and focus only, so on every phone and tablet the info control beside
// all nine rows opened NOTHING (VERIFY-U-P2 D1). A dead control on the exact
// affordance the dialog's honesty rests on is the "never dead, disabled-looking,
// or lying" law failing in the one place it matters most.
//
// The fix is not a third component and not a smarter tooltip: it is this one,
// mounted in both places. A disclosure is also the correct primitive — the
// content is a LIST the person may want to read slowly, which is exactly what a
// tooltip is not for.
//
// 🚨 NO MACHINE KEYS REACH THE PERSON (VERIFY-U-P2 D6). Capability keys like
// `drive_files` and `youtube_analytics` are addresses; the person sees the
// product name and a sentence (`rolloutSentence`). The provider's own scope
// STRING stays — it is Google's wording, shown on purpose beside our sentence,
// and it is the thing PLAN §2 promises.

import { useId, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, Info } from "lucide-react";
import { formatRelativeTime, parseTimestamp } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";
import { rolloutSentence, type ConnectorProductHealth } from "./health";

/** Absolute timestamp → how long ago, or null when it is not a timestamp. */
export function relativeTime(iso: string | null): string | null {
  if (!parseTimestamp(iso)) return null;
  return formatRelativeTime(iso, { style: "long" });
}

export interface ProductPermissionsDisclosureProps {
  providerName: string;
  health: ConnectorProductHealth;
  /**
   * Show this product's last successful call and last refusal. On by default in
   * the health rows; off in the consent dialog, where nothing has run yet.
   */
  showActivity?: boolean;
  /** Trigger wording. Defaults read well on a health row. */
  closedLabel?: string;
  openLabel?: string;
  className?: string;
}

/**
 * A real disclosure: a `<button>` with `aria-expanded` and `aria-controls`.
 * Click, tap, Enter and Space all work; the content stays open until it is
 * closed, so a person can read it, select it and copy it.
 */
export function ProductPermissionsDisclosure({
  providerName,
  health,
  showActivity = true,
  closedLabel,
  openLabel,
  className,
}: ProductPermissionsDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rollout = rolloutSentence(health);
  const lastSuccess = relativeTime(health.lastSuccessAt);
  // A GRANT IS NOT A CALL (N12): a product with a grant and no success has
  // never been used, only approved — the disclosure says exactly that, never
  // "last successful use", which is a fact this product does not have yet.
  const lastGrant = relativeTime(health.lastGrantAt);

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex min-h-11 items-center gap-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:min-h-0"
      >
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
        {open
          ? (openLabel ?? "Hide permissions")
          : (closedLabel ?? "What it can do")}
      </button>

      {open ? (
        <div id={panelId} className="mt-1.5 border-l border-border py-1 pl-2 sm:rounded-md sm:border-0 sm:bg-muted/40 sm:p-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            What {providerName} is asked for
          </p>
          <ul className="space-y-1.5">
            {health.scopes.map((fact) => (
              <li key={fact.scope} className="flex items-start gap-1.5">
                {fact.granted ? (
                  <Check
                    className="mt-0.5 h-3 w-3 shrink-0 text-success"
                    aria-hidden
                  />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0 text-warning"
                    aria-hidden
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-xs text-foreground">
                    {fact.language}
                    {fact.granted ? " — already granted" : ""}
                  </span>
                  <span className="block break-all font-mono text-[10px] text-muted-foreground">
                    {fact.scope}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {rollout ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {rollout}
            </p>
          ) : null}

          {showActivity ? (
            <dl className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 text-[11px]">
              <div className="flex items-start gap-1.5">
                <Clock
                  className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <dt className="text-muted-foreground">Last successful use:</dt>
                <dd
                  className={cn(
                    lastSuccess ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {/* Never a blank and never the account's timestamp wearing a
                      product's label. The server records this per product now;
                      when it has recorded nothing, the row says exactly that. */}
                  {lastSuccess ??
                    // A grant alone is never shown as a successful call (N12):
                    // the product has been approved but never yet used.
                    (lastGrant
                      ? `connected, no calls yet (granted ${lastGrant}).`
                      : "no calls recorded yet.")}
                </dd>
              </div>
              <div className="flex items-start gap-1.5">
                <AlertTriangle
                  className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <dt className="text-muted-foreground">Last refusal:</dt>
                <dd
                  className={cn(
                    health.lastRefusal
                      ? "text-warning"
                      : "text-muted-foreground",
                  )}
                >
                  {health.lastRefusal ? (
                    <>
                      {health.lastRefusal.message}
                      {relativeTime(health.lastRefusal.at)
                        ? ` (${relativeTime(health.lastRefusal.at)})`
                        : ""}
                      {/* The classified reason is a TECHNICAL detail, shown
                          here beside the provider's own scope strings and never
                          on the row, where the person reads the sentence (D6).
                          It is what a support conversation needs to be about
                          the same refusal the person is looking at. */}
                      {health.lastRefusal.code ? (
                        <span className="mt-0.5 block break-all font-mono text-[10px] text-muted-foreground">
                          {health.lastRefusal.code}
                          {health.lastRefusal.httpStatus
                            ? ` · HTTP ${health.lastRefusal.httpStatus}`
                            : ""}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "none recorded yet for this product."
                  )}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ProductPermissionsDisclosure;
