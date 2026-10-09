"use client";

// features/spaces/sidebar/TemplateGallery.tsx — Notion's template picker (I2): the templates the person
// can open (Spaces carrying the template label, one read) plus the built-in Traveling SMM™ OS sample;
// picking one shows its page in the preview pane, "Use template" copies it (with its sub-pages) to the
// top level of the active organization and opens the copy.

import { LayoutTemplate, TreePalm } from "lucide-react";
import { useEffect, useState } from "react";

import { TemplateGalleryShell, type TemplateEntry, type TemplateGalleryClasses } from "./TemplateGalleryShell";

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

  const entries: TemplateEntry[] = [
    { key: SAMPLE_KEY, title: SAMPLE_TITLE, icon: <TreePalm size={16} /> },
    ...listed.map((id) => ({
      key: id,
      title: docs[id]?.title || "Untitled",
      icon: docs[id]?.icon ? <SpaceIcon media={docs[id]!.icon} size={16} /> : <LayoutTemplate size={16} />,
    })),
  ];

  return (
    <TemplateGalleryShell
      open={open}
      onOpenChange={onOpenChange}
      entries={entries}
      loading={templates.ids === null && !templates.error}
      error={templates.error}
      picked={picked}
      onPick={setPicked}
      previewTitle={current?.title ?? null}
      previewLoading={!current && picked !== SAMPLE_KEY && !(picked in docs)}
      preview={
        current ? (
          <>
            <h1 className="spaces-templates-title">{current.title || "Untitled"}</h1>
            <Preview blocks={current.blocks} titleOf={(id) => sampleTitles.get(id) ?? spaces.byId.get(id)?.title ?? null} />
          </>
        ) : null
      }
      usable={!!current && !sample.adding}
      using={using || sample.adding}
      onUse={() => void use()}
      extraClassName="spaces-history spaces-templates"
      classes={SPACES_GALLERY_CLASSES}
    />
  );
}

const SPACES_GALLERY_CLASSES: TemplateGalleryClasses = {
  content: "max-w-[min(1100px,96vw)] h-[82dvh] gap-0 p-0 overflow-hidden",
  body: "spaces-templates-body",
  list: "spaces-templates-list",
  head: "spaces-history-head type-secondary text-muted-foreground",
  rows: "spaces-history-rows",
  preview: "spaces-templates-preview",
  bar: "spaces-templates-bar",
  page: "spaces-templates-page",
  row: "spaces-db-menurow",
};
