"use client";

// People involved for a bulk creation (HR launches a review cycle): ONE panel for the cycle — the
// organization-wide seats (HR, upper management) and the stage choices every review in it follows —
// with each review's own People involved one click away (access-setup PLAN §5b).

import { useEffect } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import {
  confirmAccessSetup,
  cycleKey,
  loadCycleSetup,
  selectCycleSetup,
  selectSetupBusy,
  selectSetupError,
  takeHrRole,
} from "../redux/accessSetupSlice";
import { accessSetupConfig, seatLabel } from "../registry";
import type { CycleAccessSetup } from "../types";
import { sourceNote } from "./AccessSetupPanel";
import { PersonRow, SetAtLink } from "./SeatParts";

const HEAD_TYPE = "hr_review";

function knobText(value: unknown): string {
  if (value === true) return "On";
  if (value === false) return "Off";
  if (typeof value === "string") return value.replace(/_/g, " ");
  if (typeof value === "number") return String(value);
  return "—";
}

export function CycleAccessSetupPanel({
  cycleId,
  onOpenReview,
}: {
  cycleId: string;
  onOpenReview: (reviewId: string, name: string) => void;
}) {
  const dispatch = useAppDispatch();
  const key = cycleKey(cycleId);
  const view = useAppSelector((s) => selectCycleSetup(s, key));
  const error = useAppSelector((s) => selectSetupError(s, key));

  useEffect(() => {
    void dispatch(loadCycleSetup({ cycleId }));
  }, [dispatch, cycleId]);

  if (!view) {
    return error ? (
      <div className="p-4">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Could not load who is involved"
          line={error}
          action={<Button onClick={() => void dispatch(loadCycleSetup({ cycleId }))}>Retry</Button>}
        />
      </div>
    ) : (
      <div className="p-3">
        <RegionSkeleton shape="rows" />
      </div>
    );
  }
  return <CycleBody view={view} onOpenReview={onOpenReview} />;
}

function CycleBody({ view, onOpenReview }: { view: CycleAccessSetup; onOpenReview: (id: string, name: string) => void }) {
  const dispatch = useAppDispatch();
  const key = cycleKey(view.cycle.id);
  const busy = useAppSelector((s) => selectSetupBusy(s, key));
  const me = useAppSelector(selectUserId);
  const config = accessSetupConfig(HEAD_TYPE);
  const scope = { kind: "cycle" as const, cycleId: view.cycle.id };
  const ownerSeat = view.seats.find((s) => s.key === config.ownerSeat);
  const offerOwnerSeat = ownerSeat?.fallbackOnly === true && view.myOrgRole === "owner";
  const ids = view.reviews.map((r) => r.reviewId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {offerOwnerSeat ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="text-sm">{seatLabel(config, config.ownerSeat ?? "")}: you, as organization owner</span>
            <Button
              className="ml-auto"
              disabled={busy}
              onClick={() => void dispatch(takeHrRole({ key, organizationId: view.organization.id, scope }))}
            >
              Use this for every {config.noun} in {view.organization.name}
            </Button>
          </div>
        ) : null}

        {view.seats.map((seat) => (
          <section key={seat.key} className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{seatLabel(config, seat.key)}</h3>
              <span className="ml-auto">
                <SetAtLink setAt={config.setAt(seat.key, { organizationId: view.organization.id, recordId: "" })} />
              </span>
            </div>
            {seat.holders.length === 0 ? <p className="text-xs text-muted-foreground">Nobody</p> : null}
            {seat.holders.map((h) => {
              const n = sourceNote(h, seat.key, config, view.organization.name, me, view.myOrgRole);
              return <PersonRow key={`${h.userId}-${h.source}`} person={h} note={n.note} tone={n.tone} />;
            })}
          </section>
        ))}

        {view.knobs.length > 0 ? (
          <section className="space-y-1">
            <h3 className="text-sm font-medium">Stages</h3>
            {view.knobs.map((k) => (
              <div key={k.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{config.knobs?.[k.key] ?? k.key}</span>
                <span className="ml-auto text-muted-foreground">{knobText(k.value)}</span>
                {config.knobsHref ? (
                  <Link
                    href={config.knobsHref({ organizationId: view.organization.id, key: k.key })}
                    className="text-xs text-primary hover:underline"
                  >
                    Change
                  </Link>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-1">
          <h3 className="text-sm font-medium">Reviews in {view.cycle.name}</h3>
          {view.reviews.length === 0 ? <p className="text-xs text-muted-foreground">No reviews yet</p> : null}
          {view.reviews.map((r) => (
            <div key={r.reviewId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 truncate">
                {r.employeeName} <span className="text-muted-foreground">· {r.managerName}</span>
              </span>
              {r.unusual ? <Badge tone="warning">Check</Badge> : null}
              <Button className="ml-auto" variant="quiet" icon={<Users className="h-4 w-4" />} onClick={() => onOpenReview(r.reviewId, r.employeeName)}>
                People involved
              </Button>
            </div>
          ))}
        </section>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {view.needsConfirm ? "Not confirmed yet" : `Confirmed for ${view.organization.name}`}
        </span>
        {ids.length > 0 ? (
          <Button
            className="ml-auto"
            variant={view.needsConfirm ? "primary" : "outline"}
            icon={view.needsConfirm ? <ShieldCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            disabled={busy}
            onClick={() => void dispatch(confirmAccessSetup({ key, type: HEAD_TYPE, ids, scope }))}
          >
            Confirm
          </Button>
        ) : null}
      </div>
    </div>
  );
}

