"use client";

// THE People involved panel for one record (access-setup PLAN §5b). Rows per seat: who fills it now
// and why, the parts that seat sees and from when, and — where the viewer may — add / exclude / undo
// through iam.record_seat_set / record_seat_clear. Access is already correct before this opens
// (live resolvers + fallbacks); Confirm only writes the access-log row.

import { useEffect, useState } from "react";
import { Check, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button, EmptyState, RegionSkeleton, formatDay } from "@ai-matrx/design-system/controls";

import { UserSearchField } from "@/features/user-search/UserSearchField";
import type { UserSearchCandidate } from "@/features/user-search/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import {
  changeSeat,
  confirmAccessSetup,
  loadRecordSetup,
  recordKey,
  selectRecordSetup,
  selectSetupBusy,
  selectSetupError,
  selectSetupStatus,
  takeHrRole,
} from "../redux/accessSetupSlice";
import { accessSetupConfig, seatLabel, type AccessSetupTypeConfig } from "../registry";
import type { RecordAccessSetup, SeatHolder, SeatPerson, SeatView } from "../types";
import { HolderAction, PersonRow, SeatPartsLine, SetAtLink } from "./SeatParts";

export function sourceNote(
  h: SeatHolder,
  seat: string,
  config: AccessSetupTypeConfig,
  orgName: string,
  me: string | null,
  myOrgRole: string | null,
): { note: string; tone: "neutral" | "info" | "warning" | "success" } {
  switch (h.source) {
    case "added":
      return { note: "Added here", tone: "success" };
    case "grant":
      return { note: "Shared", tone: "neutral" };
    case "fallback":
      return h.userId === me && myOrgRole === "owner"
        ? { note: "You, as organization owner", tone: "warning" }
        : { note: "Fallback: organization owner", tone: "warning" };
    case "role":
      return { note: `${seatLabel(config, seat)} in ${orgName}`, tone: "info" };
    default:
      return config.ownerSeat === seat || seat === "upper_management"
        ? { note: `${seatLabel(config, seat)} in ${orgName}`, tone: "info" }
        : { note: `From the ${config.noun}`, tone: "neutral" };
  }
}

const toCandidate = (p: SeatPerson): UserSearchCandidate => ({
  id: p.userId,
  email: p.email,
  displayName: p.name,
  avatarUrl: p.avatarUrl,
  phone: null,
  adminLevel: null,
  organizations: [],
  source: null,
  createdAt: null,
  lastSignInAt: null,
});

export function AccessSetupPanel({ entityType, recordId }: { entityType: string; recordId: string }) {
  const dispatch = useAppDispatch();
  const key = recordKey(entityType, recordId);
  const view = useAppSelector((s) => selectRecordSetup(s, key));
  const status = useAppSelector((s) => selectSetupStatus(s, key));
  const error = useAppSelector((s) => selectSetupError(s, key));

  useEffect(() => {
    void dispatch(loadRecordSetup({ type: entityType, id: recordId }));
  }, [dispatch, entityType, recordId]);

  if (!view) {
    if (status === "error") {
      return (
        <div className="p-4">
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Could not load who is involved"
            line={error}
            action={
              <Button onClick={() => void dispatch(loadRecordSetup({ type: entityType, id: recordId }))}>Retry</Button>
            }
          />
        </div>
      );
    }
    return (
      <div className="p-3">
        <RegionSkeleton shape="rows" />
      </div>
    );
  }
  return <AccessSetupBody view={view} />;
}

function AccessSetupBody({ view }: { view: RecordAccessSetup }) {
  const dispatch = useAppDispatch();
  const key = recordKey(view.entityType, view.recordId);
  const busy = useAppSelector((s) => selectSetupBusy(s, key));
  const me = useAppSelector(selectUserId);
  const config = accessSetupConfig(view.entityType);
  const canConfirm = view.seats.some((s) => s.mayChange);
  const ownerSeat = config.ownerSeat ? view.seats.find((s) => s.key === config.ownerSeat) : undefined;
  const offerOwnerSeat = ownerSeat?.fallbackOnly === true && view.myOrgRole === "owner";
  const scope = { kind: "record" as const, type: view.entityType, id: view.recordId };

  const change = (seat: string, userId: string, c: "add" | "exclude" | "undo") =>
    void dispatch(changeSeat({ type: view.entityType, id: view.recordId, seat, userId, change: c }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {offerOwnerSeat ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <span className="text-sm">
              {seatLabel(config, config.ownerSeat ?? "")}: you, as organization owner
            </span>
            <Button
              className="ml-auto"
              variant="outline"
              disabled={busy}
              onClick={() => void dispatch(takeHrRole({ key, organizationId: view.organization.id, scope }))}
            >
              Use this for every {config.noun} in {view.organization.name}
            </Button>
          </div>
        ) : null}
        {view.seats.map((seat) => (
          <SeatSection
            key={seat.key}
            seat={seat}
            view={view}
            config={config}
            me={me}
            busy={busy}
            onChange={change}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {view.confirmed
            ? `Confirmed ${formatDay(view.confirmed.at.slice(0, 10))}${view.confirmed.by ? ` by ${view.confirmed.by.name}` : ""}`
            : view.needsConfirm
              ? "Not confirmed yet"
              : null}
        </span>
        {canConfirm ? (
          <Button
            className="ml-auto"
            variant={view.needsConfirm && !view.confirmed ? "primary" : "outline"}
            icon={view.confirmed ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            disabled={busy}
            onClick={() =>
              void dispatch(confirmAccessSetup({ key, type: view.entityType, ids: [view.recordId], scope }))
            }
          >
            Confirm
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SeatSection({
  seat,
  view,
  config,
  me,
  busy,
  onChange,
}: {
  seat: SeatView;
  view: RecordAccessSetup;
  config: AccessSetupTypeConfig;
  me: string | null;
  busy: boolean;
  onChange: (seat: string, userId: string, change: "add" | "exclude" | "undo") => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const held = seat.holders.map((h) => h.userId);
  const candidates = view.candidates.filter((c) => !held.includes(c.userId)).map(toCandidate);
  const setAt = seat.mayChange ? null : config.setAt(seat.key, { organizationId: view.organization.id, recordId: view.recordId });

  return (
    <section className="space-y-1 border-b border-border py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{seatLabel(config, seat.key)}</h3>
        {view.mySeats.includes(seat.key) ? <span className="text-xs text-muted-foreground">You</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <SetAtLink setAt={setAt} />
          {seat.mayChange && (seat.many || seat.holders.length === 0) ? (
            <Button variant="quiet" icon={<UserPlus className="h-4 w-4" />} disabled={busy} onClick={() => setAdding((a) => !a)}>
              Add
            </Button>
          ) : null}
        </span>
      </div>
      {seat.holders.length === 0 ? <p className="text-xs text-muted-foreground">Nobody</p> : null}
      {seat.holders.map((h) => {
        const n = sourceNote(h, seat.key, config, view.organization.name, me, view.myOrgRole);
        return (
          <PersonRow
            key={`${h.userId}-${h.source}`}
            person={h}
            note={n.note}
            tone={n.tone}
            action={
              seat.mayChange ? (
                <HolderAction
                  holder={h}
                  disabled={busy}
                  onExclude={() => onChange(seat.key, h.userId, "exclude")}
                  onUndo={() => onChange(seat.key, h.userId, "undo")}
                />
              ) : null
            }
          />
        );
      })}
      {seat.excluded.map((p) => (
        <PersonRow
          key={`x-${p.userId}`}
          person={p}
          note="Excluded here"
          muted
          action={
            seat.mayChange ? (
              <HolderAction
                holder={{ ...p, source: "added", removable: true }}
                disabled={busy}
                onExclude={() => undefined}
                onUndo={() => onChange(seat.key, p.userId, "undo")}
              />
            ) : null
          }
        />
      ))}
      {adding ? (
        <UserSearchField
          value={query}
          onValueChange={setQuery}
          onUserSelect={(u) => {
            setAdding(false);
            setQuery("");
            onChange(seat.key, u.id, "add");
          }}
          directory="provided"
          candidates={candidates}
          excludeUserIds={held}
          title={`Add to ${seatLabel(config, seat.key)}`}
          placeholder={`Search ${view.organization.name}`}
          disabled={busy}
          className="w-full"
        />
      ) : null}
      <SeatPartsLine cells={seat.cells} config={config} />
    </section>
  );
}
