"use client";

/**
 * PlatformOutageBanner — when a provider is refusing every call, the person
 * responsible for the platform is told, on whatever page they are on.
 *
 * THE DEFECT THIS EXISTS FOR (Arman, 2026-09-12, 23:55Z). Anthropic refused
 * every call from 20:31Z to 23:21Z. For nearly three hours no AI work on the
 * platform could succeed and every screen stayed silent — the failures were
 * being recorded the whole time, on a page nobody had a reason to open.
 *
 *   "When the api goes down, my page, as a super admin should show VERY loud
 *    errors telling me there is a major problem. But this can't be something
 *    that complains constantly. It needs to tell us when big things happen
 *    like when an api like this is down."
 *
 * Both halves of that sentence are load-bearing. LOUD: destructive tone,
 * expanded by default, named provider, named failure count, named fallback (or
 * the absence of one). NOT CONSTANT: it exists only while the server says a
 * provider is down, it disappears by itself the moment calls succeed again,
 * and one click mutes THAT outage for an hour — never the next one.
 *
 * IT FLOATS, AND THAT IS THE LAW, NOT A STYLE CHOICE (Arman, 2026-09-12):
 * A NOTICE NEVER MODIFIES THE PAGE UNDERNEATH IT. The schedule alarm shipped
 * as a fixed strip that measured itself, published `--shell-alarm-h`, and made
 * every shell scroll container give up that many pixels — so an internal,
 * super-admin-only notice permanently changed the product's layout for the one
 * person who most needs to see what everyone else sees. That reservation was
 * deleted (`styles/shell.css` § NO GLOBAL BANNER CLEARANCE), and the guard
 * `styles/__tests__/no-overlay-layout-reservation.test.ts` keeps it deleted.
 * So this notice is FIXED, FULL-WIDTH-ON-ITS-OWN-TERMS, MOVABLE
 * (`useDraggableFloat`), and MUTABLE — it publishes no height, measures
 * nothing, and shifts nothing. A full-width bar wedged into `AppShell` between
 * the header and the page body is exactly the shape that was ruled out.
 *
 * MOUNTED ONCE, in `app/DeferredSingletonCore.tsx` — the singleton body under
 * `Providers`, which `AppShell` renders for BOTH `(core)` and `(admin)`. That
 * is the one shell slot both route groups share; there is no second one.
 *
 * REMAINING INVARIANTS
 *   - Super-admin only, gated BEFORE the read: everyone else renders null and
 *     issues no request at all (`enabled`), so the admin endpoint is never
 *     called by a normal user and never 403s on every page load.
 *   - Absent at zero outages (`buildOutageNotice` -> null). Never an
 *     "all providers healthy" strip — wallpaper is how the next outage is missed.
 *   - A FAILED POLL IS NOT AN OUTAGE. It renders nothing loud: the request
 *     already lands once in the Error Inspector through `lib/python-client`'s
 *     `capturePythonClientError`, and a toast on a 60-second timer would be
 *     the "complains constantly" failure in its purest form.
 *   - Every door opens (THE DOOR LAW): "See details" goes to the system-errors
 *     evidence, filtered to this kind, through `useTransition` with a real
 *     pending state on the button that was clicked.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Loader2, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraggableFloat } from "@/hooks/useDraggableFloat";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectIsSuperAdmin,
} from "@/lib/redux/selectors/userSelectors";
import {
  buildOutageNotice,
  fetchOpenOutages,
  OUTAGE_DETAILS_HREF,
  type OpenOutage,
} from "./open-outages";
import { muteOutage, readMutedIds } from "./outage-mute";

/**
 * How often the notice re-asks the server whether the provider is still down.
 * One minute: fast enough that an outage reaches the screen while it is still
 * the thing going wrong, slow enough that it is one cheap admin read per
 * minute per open super-admin tab. The server closes the row when calls
 * succeed, so this is also how fast the notice disappears on its own.
 */
const OUTAGE_POLL_MS = 60_000;

const POSITION_KEY = "matrx.platform-outage.position";

export default function PlatformOutageBanner() {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const authReady = useAppSelector(selectAuthReady);
  const accessToken = useAppSelector(selectAccessToken);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const cardRef = useRef<HTMLDivElement | null>(null);

  const canRead = Boolean(isSuperAdmin && authReady && accessToken);

  const float = useDraggableFloat({
    storageKey: POSITION_KEY,
    elementRef: cardRef,
    // Top-centre: an outage outranks everything else on the screen, and the
    // bottom-right corner already belongs to the schedule alarm. It still
    // floats over the page and still moves wherever the person puts it.
    anchor: { top: "0.75rem", centerX: true },
  });

  const { data } = useQuery<OpenOutage[]>({
    queryKey: ["platform-open-outages"],
    queryFn: fetchOpenOutages,
    enabled: canRead,
    refetchInterval: OUTAGE_POLL_MS,
    refetchOnWindowFocus: true,
    // A retry storm against a provider outage helps nobody, and a failed poll
    // is not an outage — it is silent here and captured in the Error Inspector.
    retry: false,
  });

  // Muted ids are read once on mount (and pruned of expiries as they pass),
  // never during render: `localStorage` is not available on the server and
  // reading it while rendering would differ between SSR and hydration.
  useEffect(() => {
    setMuted(readMutedIds());
  }, []);

  const notice = useMemo(() => {
    const outages = (data ?? []).filter((outage) => !muted.has(outage.id));
    return buildOutageNotice(outages);
  }, [data, muted]);

  if (!canRead) return null;
  if (notice === null) return null;

  const mute = (id: string) => {
    muteOutage(id);
    setMuted(readMutedIds());
  };

  return (
    <div
      ref={cardRef}
      // No layout reservation, no published height: `w-[min(...)]` keeps it
      // inside the viewport at 400px without a horizontal scrollbar, and
      // `z-50` puts it over the product rather than inside it.
      className="z-50 w-[min(52rem,calc(100vw-1.5rem))] shadow-xl"
      style={float.style}
      data-surface-value="platform_outage_banner"
    >
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive px-3 py-2.5 text-destructive-foreground backdrop-blur"
      >
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold">{notice.title}</p>
          <button
            type="button"
            aria-label="Drag the outage notice somewhere else"
            title="Drag me anywhere"
            className="shrink-0 rounded-md p-1 opacity-80 hover:bg-background/20 hover:opacity-100"
            onDoubleClick={float.reset}
            {...float.dragHandleProps}
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {notice.lines.map((line) => (
            <li
              key={line.id}
              data-testid="platform-outage-row"
              className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs"
            >
              <span className="min-w-0 flex-1">{line.sentence}</span>
              <button
                type="button"
                onClick={() => mute(line.id)}
                // Named, not a bare X: the consequence of the click is the
                // label. A different outage is a different id and is never
                // muted by this click.
                aria-label={`Mute the ${line.provider} outage for 1 hour`}
                title="Mute for 1 hour — it comes back on its own if the provider is still down"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 opacity-80 hover:bg-background/20 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                <span>Mute for 1 hour</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() =>
              startTransition(() => router.push(OUTAGE_DETAILS_HREF))
            }
          >
            {isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            See details
          </Button>
          {float.moved && (
            <Button size="sm" variant="ghost" onClick={float.reset}>
              Move back to the top
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
