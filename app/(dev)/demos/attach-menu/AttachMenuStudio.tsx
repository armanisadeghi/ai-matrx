"use client";

/**
 * The attach menu studio: every main attach menu in the app and every inside
 * view, numbered, so Arman can pick the best of each and the one canonical
 * menu is assembled from his picks. Everything is the REAL component; the
 * inside views are the canonical ResourcePickerMenu opened at each view.
 * When the one menu is done, the losing variants are deleted and this page
 * shrinks to the one menu.
 */

import { Component, useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { ResourcePickerTiles } from "@/features/resource-manager/resource-picker/ResourcePickerTiles";
import {
  RESOURCE_PICKER_SOURCE_ITEMS,
  flattenResourcePickerItems,
  resourcePickerItemsAsTiles,
  type ResourcePickerViewId,
} from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { ComposerPlusMenu } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/ComposerPlusMenu";
import { SourceAddMenu } from "@/features/sources/components/SourceCapture";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const noop = () => {};
const DEMO_CONVERSATION = "demo-attach-menu";
const ALL_CAPABILITIES = {
  supportsImageUrls: true,
  supportsFileUrls: true,
  supportsYoutubeVideos: true,
  supportsAudio: true,
};

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  override render() {
    if (this.state.error) return <p className="text-xs text-destructive">Render failed: {this.state.error}<ErrorAlchemyMenu error={this.state.error} /></p>;
    return this.props.children;
  }
}

function Candidate({
  n,
  name,
  where,
  children,
  className,
}: {
  n: string;
  name: string;
  where: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <header className="flex items-baseline gap-2">
        <span className="rounded-md bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
          {n}
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
        <span className="truncate text-xs text-muted-foreground">{where}</span>
      </header>
      <Boundary>{children}</Boundary>
    </section>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-fit max-w-full overflow-hidden rounded-xl border border-border bg-popover shadow-md", className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="border-b border-border pb-1 text-base font-semibold text-foreground">{children}</h2>;
}

function SourceAddMenuHost() {
  const runner = useProcessingRunner();
  return <SourceAddMenu runner={runner} onLanded={noop} />;
}

function TilesHost({ which }: { which: "doors" | "sources" }) {
  const [selected, setSelected] = useState<string | null>(null);
  const items =
    which === "doors" ? resourcePickerItemsAsTiles() : Object.values(RESOURCE_PICKER_SOURCE_ITEMS);
  return (
    <ResourcePickerTiles
      items={items}
      selectedId={selected}
      onSelect={(item) => setSelected(selected === item.id ? null : item.id)}
    />
  );
}

/** Every inside view of the canonical menu, in menu order. */
const INSIDE_VIEWS = flattenResourcePickerItems().filter((item) => item.id !== "cloud_browser");

export default function AttachMenuStudio() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6">
      <h1 className="text-lg font-semibold text-foreground">Attach menu studio</h1>

      <div className="flex flex-col gap-4">
        <SectionTitle>Main menu</SectionTitle>
        <div className="flex flex-wrap gap-6">
          <Candidate n="M1" name="Chat + menu" where="live on /chat">
            <ComposerPlusMenu
              conversationId={DEMO_CONVERSATION}
              trigger={
                <Button icon={<Plus />} type="button" variant="outline" aria-label="Open" />
              }
              mode="chat"
              size="page"
              side="bottom"
            />
          </Candidate>
          <Candidate n="M2" name="Canonical menu, new" where="every other attach button">
            <Frame>
              <ResourcePickerMenu
                conversationId={DEMO_CONVERSATION}
                onResourceSelected={noop}
                onClose={noop}
                attachmentCapabilities={ALL_CAPABILITIES}
              />
            </Frame>
          </Candidate>
          <Candidate n="M3" name="Sources add menu" where="Sources page">
            <SourceAddMenuHost />
          </Candidate>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionTitle>Tiles</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Candidate n="T1" name="All doors" where="tile grid">
            <TilesHost which="doors" />
          </Candidate>
          <Candidate n="T2" name="Sources" where="Create deck, Podcast Studio">
            <TilesHost which="sources" />
          </Candidate>
          <Candidate n="T3" name="Source input" where="Flashcards create" className="lg:col-span-2">
            <SourceInput surfaceKey="demo:attach-menu" title="Sources" purpose="this demo" />
          </Candidate>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionTitle>Inside views</SectionTitle>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {INSIDE_VIEWS.map((item, index) => (
            <Candidate key={item.id} n={`I${index + 1}`} name={item.label} where="canonical">
              <Frame className="h-[520px] w-[380px]">
                <InsideView view={item.id} />
              </Frame>
            </Candidate>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsideView({ view }: { view: Exclude<ResourcePickerViewId, null> }) {
  // Back resets by remounting the view.
  const [key, setKey] = useState(0);
  return (
    <ResourcePickerMenu
      key={key}
      conversationId={DEMO_CONVERSATION}
      initialView={view}
      onExitInitialView={() => setKey((k) => k + 1)}
      fillHost
      onResourceSelected={noop}
      onClose={noop}
      attachmentCapabilities={ALL_CAPABILITIES}
    />
  );
}
