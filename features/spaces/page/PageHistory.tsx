"use client";

// features/spaces/page/PageHistory.tsx — Notion's Page history (A13): every saved version of the page
// (one `content.space_payload` snapshot per content version, read through the store), newest first,
// a read-only preview of the one picked, and Restore — which saves that version's content as a new
// version, so nothing is lost and the restore itself is in the history.

import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useEffect, useState } from "react";

import { ErrorNotice } from "@ai-matrx/design-system";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAppSelector } from "@/lib/redux/hooks";

import type { SpaceBlock } from "../contract";
import { SpaceEditor } from "../editor/SpaceEditor";
import { useSpaces } from "../state/SpacesProvider";
import type { SpaceHistoryEntry } from "../store-db/supabase-store";

const NONE = async () => null;
const READ_ONLY_SLASH = { createSubpage: NONE, pickPage: NONE, pickSource: NONE, newDatabase: NONE };
const READ_ONLY_MENU = { moveBlocksTo: () => undefined, turnIntoPageIn: () => undefined, askAi: () => undefined };
const IGNORE = () => undefined;

const text = (b: SpaceBlock) => (b.text ?? []).map((s) => s.text).join("");

export function Preview({ blocks, depth = 0, titleOf }: { blocks: SpaceBlock[]; depth?: number; titleOf?: (spaceId: string) => string | null }) {
  return (
    <>
      {blocks.map((b) => {
        const t = text(b);
        const level = b.type === "heading" ? Number(b.props?.level ?? 1) : 0;
        return (
          <div key={b.id} style={{ paddingLeft: depth * 20 }}>
            {t ? (
              <p className="spaces-history-line" data-level={level || undefined} data-type={b.type}>
                {b.type === "bulletListItem" || b.type === "bullet" ? "• " : ""}
                {t}
              </p>
            ) : (b.type === "page" || b.type === "linkToPage") && titleOf ? (
              <p className="spaces-history-line spaces-history-pageline">{titleOf(String(b.props?.spaceId ?? "")) || "Untitled"}</p>
            ) : b.type === "database" || b.type === "page" || b.type === "linkToPage" || b.type === "image" ? (
              <p className="spaces-history-line text-muted-foreground">[{b.type}]</p>
            ) : null}
            {b.children?.length ? <Preview blocks={b.children} depth={depth + 1} titleOf={titleOf} /> : null}
          </div>
        );
      })}
    </>
  );
}

export function PageHistory({
  open,
  onOpenChange,
  spaceId,
  onRestore,
  editable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  onRestore: (entry: SpaceHistoryEntry) => void;
  editable: boolean;
}) {
  const me = useAppSelector(selectUserId);
  const { store, byId } = useSpaces();
  const title = byId.get(spaceId)?.title ?? "";
  const [rows, setRows] = useState<SpaceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void store.history(spaceId).then(
      (r) => {
        if (!live) return;
        setRows(r);
        setPicked(0);
        setError(null);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : "The history could not be read."),
    );
    return () => {
      live = false;
    };
  }, [open, store, spaceId]);
  const entry = rows?.[picked];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="spaces-history max-w-[min(1000px,96vw)] h-[80dvh] gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Page history</DialogTitle>
        <div className="spaces-history-body">
          <div className="spaces-history-preview">
            {error ? <ErrorNotice title="The history could not be read" message={error} size="compact" /> : null}
            {!rows && !error ? <RegionSkeleton shape="rows" count={8} aria-label="Loading page history" /> : null}
            {entry ? (
              // Notion draws the old version as the page itself: the real block renderer, read-only.
              <div className="spaces-history-doc">
                <h1 className="spaces-history-title">{title || "Untitled"}</h1>
                <SpaceEditor
                  key={entry.contentVersion}
                  spaceId={spaceId}
                  initialBlocks={entry.snapshot.blocks}
                  editable={false}
                  onChange={IGNORE}
                  slash={READ_ONLY_SLASH}
                  menu={READ_ONLY_MENU}
                />
              </div>
            ) : null}
          </div>
          <aside className="spaces-history-list">
            <div className="spaces-history-head type-secondary text-muted-foreground">Page history</div>
            <div className="spaces-history-rows">
              {rows?.map((r, i) => (
                <div
                  key={r.contentVersion}
                  role="button"
                  tabIndex={0}
                  data-clickable=""
                  className="spaces-db-menurow"
                  data-active={i === picked ? "true" : undefined}
                  onClick={() => setPicked(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPicked(i);
                    }
                  }}
                >
                  <span className="flex flex-1 flex-col text-left">
                    <span>{new Date(r.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    <span className="type-secondary text-muted-foreground">{r.savedBy && r.savedBy === me ? "You" : "A member"}</span>
                  </span>
                  {i === 0 ? <span className="type-secondary text-muted-foreground">Current</span> : null}
                </div>
              ))}
              {/* read-gate-exempt: rows stays null when the read fails; the error notice shows above */}
              {rows && !rows.length ? <p className="px-3 type-body text-muted-foreground">No saved versions</p> : null}
            </div>
            <div className="spaces-history-actions">
              <Button variant="quiet" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="primary"
                disabled={!editable || !entry || picked === 0}
                onClick={() => {
                  if (!entry) return;
                  onRestore(entry);
                  onOpenChange(false);
                }}
              >
                Restore version
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
