"use client";

// features/spaces/collab/PublishPanel.tsx — the Share menu's Publish tab (J1), Notion's "Share to web".
//
// Not published: one Publish button. Published: the public link (open / copy), Include sub-pages (on),
// Allow search engines (off), Allow duplicate as template (on), Site customization (the link's slug),
// Unpublish. Every choice is one door call (publish/publish-doors.ts); the database decides who may.

import { Button, Input, Switch } from "@ai-matrx/design-system/controls";
import { ArrowUpRight, Copy, Globe } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { copyToClipboard } from "@/lib/clipboard/copy";
import { toast } from "@/lib/toast";

import {
  changePublish,
  syncPublishedPictures,
  publicPageUrl,
  readPublishState,
  setSearchEngines,
  type PublishChange,
  type PublishState,
} from "../publish/publish-doors";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function Toggle({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <label
      className="flex min-h-8 items-center justify-between gap-3 rounded px-1 text-sm"
      data-testid={testId}
    >
      <span>{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </label>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border pt-2">{children}</div>
  );
}

export function PublishPanel({ spaceId }: { spaceId: string }) {
  const [state, setState] = useState<PublishState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    readPublishState(spaceId).then(
      (s) => {
        if (!live) return;
        // A cover chosen after publishing is brought public when the panel opens (best effort, silent).
        if (s.published && tick === 0) void syncPublishedPictures(spaceId);
        setState(s);
        setSlug(s.slug ?? "");
        setError(null);
      },
      (e: unknown) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "We couldn't read this page's publish settings.",
          );
      },
    );
    return () => {
      live = false;
    };
  }, [spaceId, tick]);

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      load();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That change did not save.");
    } finally {
      setBusy(false);
    }
  };
  const change = (c: PublishChange, done?: string) =>
    run(async () => {
      const pictures = await changePublish(spaceId, c);
      if (pictures.failed > 0) toast.warning("Some pictures on this page could not be made public.");
    }, done);

  if (error) {
    return (
      <div className="grid gap-2 p-1 text-sm">
        <span className="text-destructive">{error}<ErrorAlchemyMenu error={error} /></span>
        <Button variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }
  if (!state)
    return <div className="spaces-db-loading h-24" aria-busy="true" />;

  if (!state.published) {
    return (
      <div className="grid gap-2 p-1" data-testid="publish-panel">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe size={15} />
          Publish to the web
        </div>
        <Button
          variant="primary"
          className="w-full"
          disabled={busy}
          onClick={() => void change({ published: true }, "Published")}
          data-testid="publish-button"
        >
          {busy ? "Publishing…" : "Publish"}
        </Button>
      </div>
    );
  }

  const url = publicPageUrl(state.slug ?? spaceId);
  const slugChanged = slug.trim() !== (state.slug ?? "");
  return (
    <div className="grid gap-2 p-1" data-testid="publish-panel">
      <div className="flex items-center gap-1.5">
        <Input
          value={url}
          readOnly
          aria-label="Public link"
          className="min-w-0 flex-1"
          data-testid="publish-url"
        />
        <Button
          variant="quiet"
          aria-label="Copy link"
          title="Copy link"
          onClick={() => void copyToClipboard(url, "Copied link")}
        >
          <Copy size={15} />
        </Button>
        <Button
          variant="quiet"
          aria-label="Open the public page"
          title="Open"
          onClick={() => window.open(url, "_blank", "noopener")}
        >
          <ArrowUpRight size={15} />
        </Button>
      </div>
      <Section>
        <Toggle
          label="Include sub-pages"
          checked={state.includeSubPages}
          disabled={busy}
          onChange={(on) => void change({ includeSubPages: on })}
          testId="publish-sub-pages"
        />
        <Toggle
          label="Allow search engines"
          checked={state.indexed === true}
          disabled={busy}
          onChange={(on) => void run(() => setSearchEngines(spaceId, on))}
          testId="publish-search-engines"
        />
        <Toggle
          label="Allow duplicate as template"
          checked={state.allowDuplicate}
          disabled={busy}
          onChange={(on) => void change({ allowDuplicate: on })}
          testId="publish-duplicate"
        />
      </Section>
      <Section>
        <span className="px-1 text-xs font-medium text-muted-foreground">
          Site customization
        </span>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 px-1 text-xs text-muted-foreground">
            /site/
          </span>
          <Input
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            aria-label="Page link"
            className="min-w-0 flex-1"
            data-testid="publish-slug"
          />
          <Button
            variant="outline"
            disabled={busy || !slugChanged || slug.trim().length < 3}
            onClick={() => void change({ slug: slug.trim() }, "Link updated")}
          >
            Save
          </Button>
        </div>
      </Section>
      <Section>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void change({ published: false }, "Unpublished")}
          data-testid="unpublish-button"
        >
          Unpublish
        </Button>
      </Section>
    </div>
  );
}
