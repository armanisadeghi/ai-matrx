"use client";

// features/marketing/seo/ai-visibility/panels/DesignPanelForm.tsx
//
// "Design a panel" — the create form the Panels page never had. Two fields,
// both prefilled: the site's address and a description of the business (the
// site's own description, else its brand's). Submitting starts the design
// workflow (`POST /ai-visibility/panels/design`), which researches the site
// and stops four times for a person's review.
//
// Inline, never a modal. The start button states what it spends before it
// runs (policies/destructive-and-expensive-actions.md); nothing is scheduled.

import { useMutation } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@ai-matrx/design-system";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import { useAppDispatch } from "@/lib/redux/hooks";

import { startPanelDesign } from "./panel-api";
import type { DesignRunView } from "./types";

export function DesignPanelForm({
  site,
  brandId,
  onStarted,
  onCancel,
}: {
  site: MarketingSite;
  brandId: string | null;
  onStarted: (view: DesignRunView) => void;
  onCancel: () => void;
}) {
  const dispatch = useAppDispatch();
  const brand = useBrand(brandId ?? "");
  const [url, setUrl] = useState(site.root_url);
  const [name, setName] = useState("");
  // Until the person types, the description follows the best prefill we have
  // (the brand arrives a moment after the site).
  const [typedDescription, setTypedDescription] = useState<string | null>(null);
  const prefill = site.description?.trim() || brand.data?.description?.trim() || "";
  const description = typedDescription ?? prefill;

  const start = useMutation({
    mutationFn: () =>
      startPanelDesign(
        dispatch,
        {
          site_id: site.id,
          url: url.trim(),
          description: description.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
        },
        site.organization_id,
      ),
    onSuccess: onStarted,
  });

  return (
    <form
      className="flex flex-col gap-3 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate();
      }}
    >
      <p className="text-xs text-muted-foreground">
        We research the business from its website and description, work out who
        buys and what they are trying to get done, and write the questions those
        buyers would really ask an AI assistant — without ever showing the writer
        your name. You review the result four times along the way.
      </p>
      <div className="grid gap-1">
        <Label htmlFor="panel-design-url" className="text-xs">
          Website address
        </Label>
        <Input
          id="panel-design-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          className="text-sm"
        />
        {!url.trim() ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            The research starts from this address — without it there is little to
            go on.
          </p>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="panel-design-description" className="text-xs">
          What the business does
        </Label>
        <Textarea
          id="panel-design-description"
          value={description}
          onChange={(event) => setTypedDescription(event.target.value)}
          placeholder="In a sentence or two: what you sell, and to whom."
          className="min-h-20 text-sm"
        />
        {typedDescription === null && prefill ? (
          <p className="text-[11px] text-muted-foreground">
            Filled in from {site.description?.trim() ? "this site's" : "the brand's"}{" "}
            saved description. Change it freely.
          </p>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="panel-design-name" className="text-xs">
          Panel name (optional)
        </Label>
        <Input
          id="panel-design-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`${site.name} buyer questions`}
          className="text-sm"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Starting runs paid AI research on this site now. It schedules nothing:
        the panel does not start asking engines on its own.
      </p>
      {start.error ? (
        <p className="text-[11px] text-destructive">
          The design did not start: {start.error.message}{" "}
          <ErrorAlchemyMenu error={start.error} />
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={start.isPending}>
          {start.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardList className="h-3.5 w-3.5" />
          )}
          Start the design
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
