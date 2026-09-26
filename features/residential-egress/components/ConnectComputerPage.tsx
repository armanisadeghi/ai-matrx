/**
 * features/residential-egress/components/ConnectComputerPage.tsx
 *
 * `/connect-computer` — the one page a person lands on from the helper, from
 * the tray menu, and from the "Set up" door on their devices page.
 *
 * TWO STATES, DECIDED BY THE URL:
 *   ?code=ABCD-1234  →  the approval card. The helper made this code; the
 *                       person says whether that computer is theirs.
 *   no code          →  the downloads, the desktop-app path, and a plain
 *                       explanation of what this does and — just as important —
 *                       what it does not do.
 *
 * THE DOWNLOAD LINKS COME FROM THE REGISTER, never from a constant: the knob
 * `residential_egress.helper_download_base_url` is read through the shared
 * client resolver (`useScopedKnobs`, one `platform.knob_index` RPC).
 *
 * 🚨 AN EMPTY VALUE MEANS "NOT PUBLISHED YET", AND IT IS THE LIVENESS CHECK.
 * The standalone installers live on a release tag that the packaging workflow
 * has never run, so a button pointing at it would hand a non-technical person
 * a 404. There is no browser-side reachability test worth trusting (the
 * release host answers a cross-origin HEAD with an opaque response), so the
 * knob IS the switch: blank until the release exists, set the moment it does,
 * and this page renders the buttons with no new release of its own. Blank —
 * or absent, or not a web address — renders the plain sentence and the
 * desktop-app path instead, never a button.
 *
 * Copy discipline (contract § Names): "Home connection". No "proxy", "egress",
 * "residential" or "IP" anywhere a person reads — and no setting key, table
 * name or route either: an internal identifier on a user's screen is the same
 * defect wearing different words.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Apple,
  CircleAlert,
  Download,
  HouseWifi,
  Laptop,
  Loader2,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  approvePairing,
  denyPairing,
  fetchEgressStatus,
  fetchPairingByCode,
} from "../service";
import {
  HELPER_DOWNLOADS,
  HELPER_DOWNLOAD_BASE_URL_KNOB,
  HOME_CONNECTIONS_HREF,
  RESIDENTIAL_EGRESS_FEATURE,
  type EgressPairingByCode,
  type EgressStatus,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@/lib/text/asClause";

function OsIcon({ os }: { os: string }) {
  const className = "h-4 w-4 shrink-0";
  if (os === "Mac") return <Apple className={className} aria-hidden="true" />;
  if (os === "Windows")
    return <Monitor className={className} aria-hidden="true" />;
  return <Laptop className={className} aria-hidden="true" />;
}

function platformLabel(platform: string | null): string {
  const value = (platform ?? "").toLowerCase();
  if (value.includes("darwin") || value.includes("mac")) return "macOS";
  if (value.includes("win")) return "Windows";
  if (value.includes("linux")) return "Linux";
  return platform ?? "an unknown kind of computer";
}

// ---------------------------------------------------------------------------
// The downloads
// ---------------------------------------------------------------------------

/**
 * Is the standalone helper published?
 *
 * PURE so the decision is testable without a browser, and deliberately
 * BOOLEAN: there is one honest answer a person can act on ("download it" /
 * "it isn't ready"), and every way of not having a web address — the row
 * absent, the value blank, the value something that is not a link — is the
 * same answer. It never returns a reason string for the screen, because the
 * reason is ours and the screen is theirs.
 */
export function resolveDownloadBaseUrl(
  knobs: ReadonlyArray<{ key: string; origin: string; effective_value: unknown }>,
): { published: true; baseUrl: string } | { published: false } {
  const knob = knobs.find((k) => k.key === HELPER_DOWNLOAD_BASE_URL_KNOB);
  if (!knob || knob.origin === "missing") return { published: false };
  const value = knob.effective_value;
  if (typeof value !== "string") return { published: false };
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/.test(trimmed)) return { published: false };
  return { published: true, baseUrl: trimmed };
}

/** The one sentence, in one place, so the page and its test agree. */
export const HELPER_NOT_PUBLISHED_SENTENCE =
  "The standalone helper for computers without the AI Matrx desktop app is not published yet.";

function Downloads() {
  const organizationId = useAppSelector(selectOrganizationId);
  const { knobs, isLoading, error } = useScopedKnobs({
    organizationId,
    featurePrefix: RESIDENTIAL_EGRESS_FEATURE,
  });

  const resolved = useMemo(() => resolveDownloadBaseUrl(knobs), [knobs]);

  // NO ORGANIZATION YET IS NOT AN ANSWER. The resolver answers per
  // organization and holds its read until one is active, so before the shell
  // has hydrated it returns an empty list — which would otherwise read as
  // "not published", a confident wrong sentence on every first paint. It is a
  // wait, and it says so.
  if (!organizationId || isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Finding the download for your computer…
      </div>
    );
  }

  // A read that FAILED is a different fact from a read that said "not yet",
  // and the person is told which one happened — but neither one gets a button.
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-xs text-amber-700 dark:text-amber-400">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          We could not check whether the download is ready, so there is nothing
          to offer here yet. Reload the page to try again. If you already have
          the AI Matrx desktop app, you do not need this download at all — turn
          it on there instead, as described below.
          <ErrorAlchemyMenu />
        </span>
      </div>
    );
  }

  if (!resolved.published) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
        <HouseWifi className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">
            {HELPER_NOT_PUBLISHED_SENTENCE}
          </span>{" "}
          Until it is, use the AI Matrx desktop app: open it on the computer you
          want to use and turn on Settings &rarr; Home Connection. The download
          appears here by itself once it is ready — you will not need to update
          anything.
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {HELPER_DOWNLOADS.map((item) => (
        <a
          key={item.os}
          href={`${resolved.baseUrl}/${item.asset}`}
          className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-3 transition-colors hover:border-primary/50"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <OsIcon os={item.os} />
            Download for {item.os}
            <Download
              className="ml-auto h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
          <span className="text-[11px] text-muted-foreground">
            {item.detail}
          </span>
        </a>
      ))}
    </div>
  );
}

/**
 * WHAT IS ALREADY TRUE, before offering a download: is the capability on at
 * all, and does this person already have computers connected? `GET
 * /egress/status` is the one call that answers both, and offering a download
 * to someone who already has three connected computers — or while the whole
 * capability is switched off — is the kind of quiet nonsense this line exists
 * to prevent. A failed call says so; it never silently pretends there are none.
 */
function ExistingComputers() {
  const [status, setStatus] = useState<EgressStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEgressStatus()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-[11px] text-amber-600 dark:text-amber-400">
        We could not check which of your computers are already connected:{" "}
        {asClause(error)}. The steps below still work.
        <ErrorAlchemyMenu error={error} />
      </p>
    );
  }
  if (!status) return null;
  if (!status.feature_enabled) {
    return (
      <p className="text-[11px] text-amber-600 dark:text-amber-400">
        Home connections are switched off for your account right now, so a
        computer you connect will not be used until an administrator turns them
        back on.
      </p>
    );
  }
  if (status.computers.length === 0) return null;
  const connected = status.computers.filter((c) => c.connected && c.enabled);
  return (
    <p className="text-[11px] text-muted-foreground">
      You already have {status.computers.length} computer
      {status.computers.length === 1 ? "" : "s"} set up
      {connected.length > 0
        ? `, and ${connected.length} of them ${connected.length === 1 ? "is" : "are"} online right now`
        : ", none of them online right now"}
      . Adding another gives AI Matrx a second way out when one is asleep.
    </p>
  );
}

// ---------------------------------------------------------------------------
// The approval card
// ---------------------------------------------------------------------------

function ApprovalCard({ code }: { code: string }) {
  const router = useRouter();
  const [pairing, setPairing] = useState<EgressPairingByCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<"approved" | "denied" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPairing(await fetchPairingByCode(code));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setBusy(true);
    try {
      const result = await approvePairing(code);
      setSettled("approved");
      toast.success(`${result.display_name} is connected to your account.`);
    } catch (err) {
      toast.error(
        `That computer could not be connected: ${extractErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function deny() {
    setBusy(true);
    try {
      await denyPairing(code);
      setSettled("denied");
    } catch (err) {
      toast.error(
        `That request could not be turned down: ${extractErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Looking up the code {code}…
      </div>
    );
  }

  if (error || !pairing) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-4 text-sm text-amber-700 dark:text-amber-400">
        <p className="font-medium">
          The code {code} does not match a computer waiting to connect.
        </p>
        <p className="mt-1 text-xs">
          {error ??
            "It may have already been used, or it may have expired — a code is good for 15 minutes."}{" "}
          Run Connect again on that computer to get a fresh code.
          <ErrorAlchemyMenu error={error} />
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 h-7 text-xs"
          onClick={() => router.replace("/connect-computer")}
        >
          Start over
        </Button>
      </div>
    );
  }

  if (settled === "approved") {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-4 text-sm">
        <p className="font-medium text-foreground">
          {pairing.display_name} is connected.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          It will show up as a home connection on that computer within a few
          seconds, and you can pause or remove it any time from your devices
          page.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 h-7 text-xs"
          // The DURABLE devices route. `/settings?tab=devices` (the tray's
          // link) redirects to the profile page and drops the query on the
          // way, so it never reaches this list — see the feature doc.
          onClick={() => router.push(HOME_CONNECTIONS_HREF)}
        >
          See my computers
        </Button>
      </div>
    );
  }

  if (settled === "denied") {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-4 text-sm">
        <p className="font-medium text-foreground">
          Turned down. {pairing.display_name} was not connected to your account.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          If you did not start this yourself, nothing has been shared — the
          request simply ends here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-4 py-4">
      <h2 className="text-base font-semibold text-foreground">
        Connect &ldquo;{pairing.display_name}&rdquo; to your account?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A computer running {platformLabel(pairing.platform)} asked to become one
        of your home connections, using the code {code}. Only connect it if you
        started this yourself, on a computer you own.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Once connected, AI Matrx may use this computer&rsquo;s internet
        connection — and only for your own work — when a website blocks our
        servers. You can pause or remove it at any time.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void approve()}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          Connect this computer
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void deny()}
        >
          Not mine
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function ConnectComputerPage() {
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="flex items-center gap-2">
        <HouseWifi className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">
          Connect a computer
        </h1>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        Some websites block requests that come from a data centre. If you let
        AI Matrx use one of your own computers, it can open those pages the way
        you would — through your own internet connection at home or at the
        office.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {code ? null : <ExistingComputers />}
        {code ? <ApprovalCard code={code} /> : <Downloads />}
      </div>

      {code ? null : (
        <section className="mt-5 rounded-md border border-border bg-card px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Already have the AI Matrx desktop app?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            You do not need a second download. Open the desktop app and turn on
            Settings &rarr; Home Connection. It uses the same account you are
            signed in with here, and the computer appears on your devices page
            straight away.
          </p>
        </section>
      )}

      <section className="mt-5 rounded-md border border-border bg-card px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          What this does, and what it does not
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              It is used only when we get blocked.
            </span>{" "}
            AI Matrx always tries its own servers first. Your computer is asked
            only for the one page that was refused.
          </li>
          <li>
            <span className="font-medium text-foreground">
              It is only ever used for your own work.
            </span>{" "}
            Nobody else&rsquo;s tasks can travel through your computer — not
            your teammates&rsquo;, not an administrator&rsquo;s.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Nothing on your computer is exposed.
            </span>{" "}
            The helper reaches out to us; nothing reaches in. It does not open a
            port, change your router, or touch anything else on your home or
            office network — it can only visit public websites.
          </li>
          <li>
            <span className="font-medium text-foreground">
              You can stop it in one click.
            </span>{" "}
            Pause or remove the computer here or from the helper itself, and it
            takes effect everywhere within 30 seconds.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default ConnectComputerPage;
