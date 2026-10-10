"use client";

/**
 * Every "attach / add source / associate a resource" button set in the app,
 * side by side, so one final set can be picked and locked. Each card renders
 * the REAL component imported from where it lives — never a recreation.
 * Census + ruling context: the commit that added this page.
 */

import { Component, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

// Canonical family — features/resource-manager/resource-picker/
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { ResourcePickerButton } from "@/features/resource-manager/resource-picker/ResourcePickerButton";
import { ResourcePickerTiles } from "@/features/resource-manager/resource-picker/ResourcePickerTiles";
import {
  RESOURCE_PICKER_SOURCE_ITEMS,
  resourcePickerItemsAsTiles,
} from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";

// Local copies
import { ComposerPlusMenu } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerPlusMenu";
import { SourceAddMenu } from "@/features/sources/components/SourceCapture";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { StartHero } from "@/features/education/onboard/components/StartHero";
import { AudioImportDialog } from "@/features/transcript-studio/components/columns/AudioImportDialog";
import { SourcePickerPanel } from "@/components/markdown-studio/lab/SourcePickerPanel";
import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import { CLASS_PICKER_TOKENS } from "@/features/education/classes/hooks/useClassContent";
import { GeneratorForm } from "@/features/podcasts/generator/components/GeneratorForm";
import type { PodcastSourceKind } from "@/features/podcasts/generator/types";
import { SourceTiles } from "@/features/podcasts/studio/variants/create-refine/components/SourceTiles";
import { SourcePicker } from "@/features/podcasts/studio/variants/create-a/components/SourcePicker";
import { SourceRail } from "@/features/podcasts/studio/variants/create-e/components/SourceRail";
import { ComposerForm } from "@/features/podcasts/studio/variants/create-b/components/ComposerForm";
import { CreateComposer } from "@/features/podcasts/studio/variants/create-c/components/CreateComposer";
import { Composer as CreateDComposer } from "@/features/podcasts/studio/variants/create-d/components/Composer";
import { MOCK_SHOWS } from "@/features/podcasts/studio/variants/create-d/mock/shows";
import { Composer as ReimagineComposer } from "@/features/podcasts/studio/variants/create-reimagine/components/Composer";
import { StudioComposer } from "@/features/podcasts/studio/variants/create-f/components/StudioComposer";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const noop = () => {};
const ALL_CAPABILITIES = {
  supportsImageUrls: true,
  supportsFileUrls: true,
  supportsYoutubeVideos: true,
  supportsAudio: true,
};

class VariantBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  override render() {
    if (this.state.error) {
      return <p className="text-xs text-destructive">Render failed: {this.state.error}<ErrorAlchemyMenu error={this.state.error} /></p>;
    }
    return this.props.children;
  }
}

function Variant({
  name,
  path,
  canonical,
  wide,
  children,
}: {
  name: string;
  path: string;
  canonical: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3",
        wide && "lg:col-span-2",
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{name}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            canonical
              ? "bg-primary/10 text-primary-ink"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}
        >
          {canonical ? "Canonical" : "Local copy"}
        </span>
        <code className="w-full truncate text-[11px] text-muted-foreground">{path}</code>
      </header>
      <div className="min-w-0">
        <VariantBoundary>{children}</VariantBoundary>
      </div>
    </section>
  );
}

function TilesAllDoors() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ResourcePickerTiles
      items={resourcePickerItemsAsTiles()}
      selectedId={selected}
      onSelect={(item) => setSelected(selected === item.id ? null : item.id)}
    />
  );
}

function TilesSources() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <ResourcePickerTiles
      items={Object.values(RESOURCE_PICKER_SOURCE_ITEMS)}
      selectedId={selected}
      onSelect={(item) => setSelected(selected === item.id ? null : item.id)}
    />
  );
}

function SourceAddMenuHost() {
  const runner = useProcessingRunner();
  return <SourceAddMenu runner={runner} onLanded={noop} />;
}

function PodcastKindHost({
  render,
}: {
  render: (value: PodcastSourceKind, onChange: (k: PodcastSourceKind) => void) => ReactNode;
}) {
  const [value, setValue] = useState<PodcastSourceKind>("topic");
  return <>{render(value, setValue)}</>;
}

function AudioImportHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Open
      </Button>
      <AudioImportDialog sessionId="demo-association-buttons" open={open} onOpenChange={setOpen} />
    </>
  );
}

function StudioSourcePickerHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Open
      </Button>
      <SourcePickerPanel open={open} onOpenChange={setOpen} isAdmin onPick={noop} />
    </>
  );
}

function AssociationPickerHost() {
  const [attached, setAttached] = useState<string[]>([]);
  return (
    <div className="h-96">
      <UniversalAssociationPicker
        tokens={CLASS_PICKER_TOKENS}
        attachedKeys={new Set(attached)}
        onAttach={async (token, id) => {
          setAttached((a) => [...a, `${token}:${id}`]);
          return { ok: true };
        }}
        onDetach={async (token, id) => {
          setAttached((a) => a.filter((k) => k !== `${token}:${id}`));
          return { ok: true };
        }}
      />
    </div>
  );
}

export default function AssociationButtonsDemo() {
  // Client-only: several composers read window/storage on first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <h1 className="text-lg font-semibold text-foreground">Association buttons</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Variant
          name="Menu"
          path="features/resource-manager/resource-picker/ResourcePickerMenu.tsx"
          canonical
        >
          <div className="w-fit max-w-full rounded-lg border border-border">
            <ResourcePickerMenu
              onResourceSelected={noop}
              onClose={noop}
              attachmentCapabilities={ALL_CAPABILITIES}
            />
          </div>
        </Variant>
        <Variant
          name="Button"
          path="features/resource-manager/resource-picker/ResourcePickerButton.tsx"
          canonical
        >
          <ResourcePickerButton attachmentCapabilities={ALL_CAPABILITIES} />
        </Variant>
        <Variant
          name="Tiles — all doors"
          path="features/resource-manager/resource-picker/ResourcePickerTiles.tsx"
          canonical
        >
          <TilesAllDoors />
        </Variant>
        <Variant
          name="Tiles — sources"
          path="features/resource-manager/resource-picker/ResourcePickerTiles.tsx"
          canonical
        >
          <TilesSources />
        </Variant>
        <Variant
          name="Create deck sources"
          path="features/resource-manager/source-input/components/SourceInput.tsx"
          canonical
          wide
        >
          <SourceInput surfaceKey="demo:association-buttons" title="Sources" purpose="this demo" />
        </Variant>

        <Variant
          name="Composer plus menu"
          path="../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/composer/ComposerPlusMenu.tsx"
          canonical={false}
        >
          <ComposerPlusMenu
            conversationId="demo-association-buttons"
            trigger={
              <Button type="button" variant="outline">
                +
              </Button>
            }
            mode="chat"
            size="page"
            side="bottom"
          />
        </Variant>
        <Variant
          name="Sources add menu"
          path="features/sources/components/SourceCapture.tsx"
          canonical={false}
        >
          <SourceAddMenuHost />
        </Variant>
        <Variant
          name="Transcript audio import"
          path="features/transcript-studio/components/columns/AudioImportDialog.tsx"
          canonical={false}
        >
          <AudioImportHost />
        </Variant>
        <Variant
          name="Markdown studio sources"
          path="components/markdown-studio/lab/SourcePickerPanel.tsx"
          canonical={false}
        >
          <StudioSourcePickerHost />
        </Variant>
        <Variant
          name="Class content picker"
          path="@ai-matrx/associations/react UniversalAssociationPicker"
          canonical={false}
        >
          <AssociationPickerHost />
        </Variant>
        <Variant
          name="Podcast source tiles (refine)"
          path="features/podcasts/studio/variants/create-refine/components/SourceTiles.tsx"
          canonical={false}
        >
          <PodcastKindHost render={(v, set) => <SourceTiles value={v} onChange={set} />} />
        </Variant>
        <Variant
          name="Podcast source picker (A)"
          path="features/podcasts/studio/variants/create-a/components/SourcePicker.tsx"
          canonical={false}
        >
          <PodcastKindHost render={(v, set) => <SourcePicker value={v} onChange={set} />} />
        </Variant>
        <Variant
          name="Podcast source rail (E)"
          path="features/podcasts/studio/variants/create-e/components/SourceRail.tsx"
          canonical={false}
        >
          <PodcastKindHost render={(v, set) => <SourceRail value={v} onChange={set} />} />
        </Variant>
        <Variant
          name="Education start"
          path="features/education/onboard/components/StartHero.tsx"
          canonical={false}
          wide
        >
          <StartHero />
        </Variant>
        <Variant
          name="Podcast generator"
          path="features/podcasts/generator/components/GeneratorForm.tsx"
          canonical={false}
          wide
        >
          <GeneratorForm shows={[]} onShowCreated={noop} onGenerate={noop} busy={false} />
        </Variant>
        <Variant
          name="Podcast composer (B)"
          path="features/podcasts/studio/variants/create-b/components/ComposerForm.tsx"
          canonical={false}
          wide
        >
          <ComposerForm onGenerate={noop} />
        </Variant>
        <Variant
          name="Podcast composer (C)"
          path="features/podcasts/studio/variants/create-c/components/CreateComposer.tsx"
          canonical={false}
          wide
        >
          <CreateComposer />
        </Variant>
        <Variant
          name="Podcast composer (D)"
          path="features/podcasts/studio/variants/create-d/components/Composer.tsx"
          canonical={false}
          wide
        >
          <CreateDComposer shows={MOCK_SHOWS} />
        </Variant>
        <Variant
          name="Podcast composer (F)"
          path="features/podcasts/studio/variants/create-f/components/StudioComposer.tsx"
          canonical={false}
          wide
        >
          <StudioComposer />
        </Variant>
        <Variant
          name="Podcast composer (reimagine)"
          path="features/podcasts/studio/variants/create-reimagine/components/Composer.tsx"
          canonical={false}
          wide
        >
          <ReimagineComposer />
        </Variant>
      </div>
    </div>
  );
}
