"use client";

// features/spaces/sidebar/TemplateGallery.tsx — Notion's template picker (I2): the templates the person
// can open (Spaces carrying the template label, one read) plus the built-in Traveling SMM™ OS sample;
// picking one shows its page in the preview pane, "Use template" copies it (with its sub-pages) to the
// top level of the active organization and opens the copy.

import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { LayoutTemplate, TreePalm } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorNotice } from "@ai-matrx/design-system";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import type { SpaceDoc } from "../contract";
import { Preview } from "../page/PageHistory";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { previewAgencyTables } from "../data/sources";
import { seedSpaces, SEED_ROOT_ID } from "../store/seed";
import { SAMPLE_TITLE } from "../store/sample";

const SAMPLE_KEY = "builtin:traveling-smm-os";

export function TemplateGallery({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const spaces = useSpaces();
  const { templates, store, sample } = spaces;
  const [picked, setPicked] = useState<string>(SAMPLE_KEY);
  const [docs, setDocs] = useState<Record<string, SpaceDoc | null>>({});
  const [using, setUsing] = useState(false);

  useEffect(() => {
    if (open) templates.refresh();
    // Read the list each time the gallery opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ids = templates.ids ?? [];
  // Each template is read once (title, icon and blocks for the preview).
  useEffect(() => {
    let live = true;
    for (const id of ids) {
      if (id in docs) continue;
      void store.get(id).then(
        (d) => live && setDocs((prev) => ({ ...prev, [id]: d })),
        () => live && setDocs((prev) => ({ ...prev, [id]: null })),
      );
    }
    return () => {
      live = false;
    };
    // Keyed on the id list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const listed = ids.filter((id) => docs[id] && !docs[id]!.isArchived);
  const seed = picked === SAMPLE_KEY ? seedSpaces(previewAgencyTables()) : [];
  const sampleRoot = seed.find((s) => s.id === SEED_ROOT_ID) ?? null;
  const sampleTitles = new Map(seed.map((s) => [s.id, s.title]));
  const current = picked === SAMPLE_KEY ? sampleRoot : (docs[picked] ?? null);

  const use = async () => {
    setUsing(true);
    try {
      if (picked === SAMPLE_KEY) {
        onOpenChange(false);
        await sample.add({ asTemplate: true });
      } else if (current) {
        await templates.use(current.id, current.title);
        onOpenChange(false);
      }
    } finally {
      setUsing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="spaces-history spaces-templates max-w-[min(1100px,96vw)] h-[82dvh] gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Templates</DialogTitle>
        <div className="spaces-templates-body">
          <aside className="spaces-templates-list">
            <div className="spaces-history-head type-secondary text-muted-foreground">Templates</div>
            <div className="spaces-history-rows">
              <TemplateRow active={picked === SAMPLE_KEY} onPick={() => setPicked(SAMPLE_KEY)} icon={<TreePalm size={16} />} title={SAMPLE_TITLE} />
              {listed.map((id) => (
                <TemplateRow
                  key={id}
                  active={picked === id}
                  onPick={() => setPicked(id)}
                  icon={docs[id]?.icon ? <SpaceIcon media={docs[id]!.icon} size={16} /> : <LayoutTemplate size={16} />}
                  title={docs[id]?.title || "Untitled"}
                />
              ))}
              {templates.ids === null && !templates.error ? <RegionSkeleton shape="rows" count={3} aria-label="Loading templates" /> : null}
              {templates.error ? <ErrorNotice title="Templates could not be listed" message={templates.error} size="compact" /> : null}
            </div>
          </aside>
          <div className="spaces-templates-preview">
            <div className="spaces-templates-bar">
              <span className="min-w-0 flex-1 truncate type-title">{current?.title || "Untitled"}</span>
              <Button variant="primary" disabled={!current || using || sample.adding} onClick={() => void use()}>
                {using || sample.adding ? "Adding…" : "Use template"}
              </Button>
            </div>
            <div className="spaces-templates-page">
              {current ? (
                <>
                  <h1 className="spaces-templates-title">{current.title || "Untitled"}</h1>
                  <Preview blocks={current.blocks} titleOf={(id) => sampleTitles.get(id) ?? spaces.byId.get(id)?.title ?? null} />
                </>
              ) : picked !== SAMPLE_KEY && !(picked in docs) ? (
                <RegionSkeleton shape="rows" count={8} aria-label="Loading the template" />
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateRow({ active, onPick, icon, title }: { active: boolean; onPick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-clickable=""
      className="spaces-db-menurow"
      data-active={active ? "true" : undefined}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      <span className="spaces-menu-row-icon">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{title}</span>
    </div>
  );
}
