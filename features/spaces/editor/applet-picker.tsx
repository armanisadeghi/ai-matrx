"use client";

// features/spaces/editor/applet-picker.tsx — "/applet": choose one of the person's Applets for an Applet block.
// The same picker shape as "Linked view of database" (data/SourcePicker): a search box over a list. It opens on
// her own Applets ("Yours"; "All" = every Applet she can open, across all her organizations — never narrowed by
// the active organization) and ends with "Build a new Applet" (no dead end when she has none).
// Opened imperatively (`openAppletPicker`) like the media picker, so every editor host gets it from
// `AppletPickerHost` in SpaceEditor without a new SlashContext field.

import { Button, RegionSkeleton, SearchField, SegmentedControl } from "@ai-matrx/design-system/controls";
import { AppWindow, Plus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listPlaceableApplets, NEW_APPLET_HREF, type AppletCardInfo } from "@/features/applets/embed/appletsPort";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type Pick = (applet: AppletCardInfo) => void;

let current: Pick | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Open the Applet picker; `onPick` runs once with the chosen Applet (closing picks nothing). */
export function openAppletPicker(onPick: Pick): void {
  current = onPick;
  emit();
}

function close() {
  current = null;
  emit();
}

type Lane = "mine" | "all";

/** Pure: the rows a lane and a search show (exported for the unit test). */
export function appletPickerRows(rows: readonly AppletCardInfo[], lane: Lane, me: string | null, query: string): AppletCardInfo[] {
  const q = query.trim().toLowerCase();
  return rows.filter((a) => (lane === "all" || a.createdBy === me) && (!q || `${a.name} ${a.description ?? ""}`.toLowerCase().includes(q)));
}

function Lists({ onPick }: { onPick: Pick }) {
  const me = useAppSelector(selectUserId);
  const [rows, setRows] = useState<AppletCardInfo[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<Lane>("mine");
  useEffect(() => {
    let live = true;
    listPlaceableApplets().then(
      (list) => {
        if (!live) return;
        setRows(list);
        // Opens to her own Applets; when she has none yet, to every Applet she can open.
        if (!list.some((a) => a.createdBy === me)) setLane("all");
      },
      (err: unknown) => live && setFailed(err instanceof Error ? err.message : "Your Applets could not be listed."),
    );
    return () => {
      live = false;
    };
  }, [me]);
  const shown = rows ? appletPickerRows(rows, lane, me, query) : [];
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Applets…" aria-label="Search Applets" />
        <SegmentedControl
          value={lane}
          onValueChange={(v) => setLane(v as Lane)}
          data={[
            { value: "mine", label: "Yours" },
            { value: "all", label: "All" },
          ]}
          aria-label="Which Applets"
        />
      </div>
      <div className="max-h-[min(460px,60dvh)] overflow-y-auto py-1" data-testid="applet-picker-list">
        {!rows && !failed ? (
          <div className="px-3 py-2">
            <RegionSkeleton shape="rows" count={6} aria-label="Loading Applets" />
          </div>
        ) : null}
        {failed ? <div className="px-3 py-2 type-body text-destructive">{failed}<ErrorAlchemyMenu /></div> : null}
        {rows && !shown.length ? <div className="px-3 py-2 type-body text-muted-foreground">No Applets</div> : null}
        {shown.map((a) => (
          <Button variant="quiet" icon={<AppWindow size={15} />} key={a.id} onClick={() => onPick(a)} data-applet-option={a.id}>
            <span className="flex-1 truncate text-left">{a.name}</span>
            {a.description ? <span className="max-w-[45%] truncate type-secondary text-muted-foreground">{a.description}</span> : null}
          </Button>
        ))}
        <a href={NEW_APPLET_HREF} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 type-body text-muted-foreground hover:text-foreground" data-clickable="">
          <Plus size={15} aria-hidden /> Build a new Applet
        </a>
      </div>
    </>
  );
}

/** Mounted once per editable editor (SpaceEditor), beside the media picker. */
export function AppletPickerHost() {
  const pick = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return (
    <Dialog open={!!pick} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent padding="none" showCloseButton={false}>
        <DialogTitle className="sr-only">Choose an Applet</DialogTitle>
        {pick ? (
          <Lists
            onPick={(a) => {
              close();
              pick(a);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
