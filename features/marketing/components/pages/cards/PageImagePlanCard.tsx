"use client";

/**
 * PageImagePlanCard — plan the images this page SHOULD have: per-planned-
 * image description, alt text, placement, style preset, and status, saved in
 * `desired_values.image_plan` through the shared slice contract. Each entry
 * generates with ONE click through the default two-step mini-pipeline
 * (prompt generator → Matrx Image Ultra); the split-button menu offers the
 * premium all-in-one agent and the surface's `image_producer` role binding
 * as overrides. Generated file_ids persist onto the entry immediately and
 * render via the canonical media pipeline.
 *
 * NOTE: the scraper currently stores only image COUNTS ({count, missing_alt})
 * — there is no observed per-image inventory to mirror yet. When the crawler
 * starts persisting the real <img> list, the observed side lands here.
 */

import { useState } from "react";
import {
  ChevronDown,
  ImagePlus,
  ListTodo,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { MARKETING_PAGE_SURFACE_NAME } from "@/features/marketing/lib/marketing-page-scope";
import {
  generatePageImage,
  generatePageImageAllInOne,
  generatePageImageTwoStep,
  type PageImageResult,
} from "@/features/marketing/lib/generate-page-image";
import { useAppDispatch } from "@/lib/redux/hooks";
import type {
  DesiredImagePlanEntry,
  MarketingPage,
} from "@/features/marketing/types";

const IMAGE_PRODUCER_ROLE = "image_producer";

/** Style presets offered in the compact per-entry select (custom allowed). */
const STYLE_PRESETS = [
  "Hero / Banner",
  "Infographic",
  "Informational Diagram",
  "Data Visual",
  "Photorealistic Photo",
  "Product Photography & Mockup",
  "Editorial Illustration",
  "Social Share Card",
  "Cinematic Photo",
  "Professional Educational Concept",
] as const;

const STYLE_NONE = "__none__";
const STYLE_CUSTOM = "__custom__";

type GenerateMode = "two-step" | "all-in-one" | "surface";

function newEntry(): DesiredImagePlanEntry {
  return {
    id: crypto.randomUUID(),
    description: "",
    alt: "",
    placement: "",
    status: "planned",
    file_id: null,
  };
}

export function PageImagePlanCard({ page }: { page: MarketingPage }) {
  const dispatch = useAppDispatch();
  const desired = useDesiredValueSlice(page, "image_plan");
  const entries = desired.draft ?? [];
  const openTaskWindow = useOpenTaskQuickCreateWindow();
  const { roles } = useSurfaceAgentRoles(MARKETING_PAGE_SURFACE_NAME);
  const imageAgentId = roles[IMAGE_PRODUCER_ROLE]?.effectiveAgentId ?? null;
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  /** Entries whose style select sits in free-text "Custom…" mode. */
  const [customStyleIds, setCustomStyleIds] = useState<Set<string>>(
    () => new Set(),
  );

  const updateEntry = (id: string, patch: Partial<DesiredImagePlanEntry>) => {
    desired.setDraft(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const styleSelectValue = (entry: DesiredImagePlanEntry): string => {
    if (customStyleIds.has(entry.id)) return STYLE_CUSTOM;
    if (!entry.style) return STYLE_NONE;
    return (STYLE_PRESETS as readonly string[]).includes(entry.style)
      ? entry.style
      : STYLE_CUSTOM;
  };

  const onStyleSelect = (entry: DesiredImagePlanEntry, value: string) => {
    setCustomStyleIds((prev) => {
      const next = new Set(prev);
      if (value === STYLE_CUSTOM) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
    if (value === STYLE_NONE) updateEntry(entry.id, { style: undefined });
    else if (value !== STYLE_CUSTOM) updateEntry(entry.id, { style: value });
  };

  const buildSpec = (entry: DesiredImagePlanEntry) =>
    [
      `Generate ONE image for the web page ${page.url} (path ${page.path || "/"}).`,
      `Description: ${entry.description || "(none provided)"}`,
      entry.alt ? `Intended alt text: ${entry.alt}` : null,
      entry.placement ? `Placement on the page: ${entry.placement}` : null,
      entry.style ? `Style: ${entry.style}` : null,
      "Return the image itself as your output.",
    ]
      .filter(Boolean)
      .join("\n");

  const persistGeneratedFile = async (entryId: string, fileId: string) => {
    // Persist immediately — a generated artifact must never sit only in
    // local state. Save the whole plan with the updated entry.
    const nextEntries = entries.map((item) =>
      item.id === entryId
        ? { ...item, file_id: fileId, status: "generated" as const }
        : item,
    );
    desired.setDraft(nextEntries);
    await desired.save();
    toast.success("Image generated and saved to the plan");
  };

  const generate = async (entry: DesiredImagePlanEntry, mode: GenerateMode) => {
    if (!entry.description.trim()) {
      toast.error("Describe the image before generating it.");
      return;
    }
    setGeneratingId(entry.id);
    try {
      if (mode === "surface") {
        if (!imageAgentId) {
          toast.error("No agent bound to the Image producer role", {
            description:
              "Bind one in this surface's config, or use the default pipeline.",
          });
          return;
        }
        const fileId = await dispatch(
          generatePageImage({
            agentId: imageAgentId,
            prompt: buildSpec(entry),
            surfaceKey: MARKETING_PAGE_SURFACE_NAME,
            // One floating window per planned image, so generating two of
            // them side by side gives the user two runs to watch.
            liveInstanceId: `page-image:${entry.id}`,
          }),
        );
        if (!fileId) {
          toast.error("Image generation returned no image", {
            description:
              "The agent run finished without an image output. Check the agent bound to the Image producer role.",
          });
          return;
        }
        await persistGeneratedFile(entry.id, fileId);
        return;
      }

      const args = {
        spec: buildSpec(entry),
        style: entry.style ?? "",
        surfaceKey: MARKETING_PAGE_SURFACE_NAME,
        liveInstanceId: `page-image:${entry.id}`,
      };
      const result: PageImageResult = await dispatch(
        mode === "all-in-one"
          ? generatePageImageAllInOne(args)
          : generatePageImageTwoStep(args),
      );
      if (!result.ok) {
        toast.error(
          result.step === "prompt"
            ? "Image generation failed at the prompt step"
            : "Image generation failed at the image step",
          { description: result.message },
        );
        return;
      }
      await persistGeneratedFile(entry.id, result.fileId);
    } finally {
      setGeneratingId(null);
    }
  };

  const copy = webCopy({
    kind: "web-page-image-plan",
    label: "Image plan",
    description:
      "The planned images for this page: descriptions, alt text, placement, style, status, and generated file ids.",
    surface: `Image plan — ${page.url}`,
    data: { url: page.url, image_plan: entries },
    lines: [
      ["URL", page.url],
      ["Planned images", entries.length],
      ...entries.map((entry): [string, string] => [
        entry.status,
        entry.description || "(no description)",
      ]),
    ],
    attributes: { page_id: page.id, count: entries.length },
  });

  return (
    <SectionCard
      title="Image plan"
      copy={copy}
      collapsible
      anchor="image_plan"
      headerExtra={
        <button
          type="button"
          onClick={() => desired.setDraft([...entries, newEntry()])}
          aria-label="Add a planned image"
          title="Add a planned image"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </button>
      }
    >
      {entries.length === 0 ? (
        <div className="grid gap-2 p-3">
          <p className="text-xs text-muted-foreground">
            No images planned yet. Describe the images this page should have —
            then generate them in one click or hand them off as tasks.
          </p>
          <div>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => desired.setDraft([newEntry()])}
            >
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              Plan an image
            </Button>
          </div>
        </div>
      ) : (
        <DesiredSection
          title="Planned images"
          hint="Descriptions become generation specs and alt text."
          dirty={desired.dirty}
          saving={desired.saving}
          onSave={() => void desired.save()}
          onReset={desired.reset}
          className="border-t-0"
        >
          <div className="grid gap-3">
            {entries.map((entry) => {
              const generating = generatingId === entry.id;
              const selectValue = styleSelectValue(entry);
              return (
                <div
                  key={entry.id}
                  className="grid gap-2.5 rounded-lg border border-border bg-muted/20 p-2.5 sm:grid-cols-[8rem_1fr]"
                >
                  <div className="grid content-start gap-1.5">
                    {entry.file_id ? (
                      <CaptureThumb
                        fileId={entry.file_id}
                        alt={entry.alt || entry.description}
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    )}
                    <Badge
                      variant={entry.status === "planned" ? "outline" : "success"}
                      className="justify-self-start text-[9px] uppercase"
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={entry.description}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            description: event.target.value,
                          })
                        }
                        minHeight={56}
                        maxHeight={120}
                        placeholder="What should this image show? Style, subject, purpose…"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Alt text</Label>
                        <Input
                          value={entry.alt}
                          onChange={(event) =>
                            updateEntry(entry.id, { alt: event.target.value })
                          }
                          placeholder="Accessible description"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Placement</Label>
                        <Input
                          value={entry.placement}
                          onChange={(event) =>
                            updateEntry(entry.id, {
                              placement: event.target.value,
                            })
                          }
                          placeholder="Hero, section 2, footer…"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Style</Label>
                        <Select
                          value={selectValue}
                          onValueChange={(value) => onStyleSelect(entry, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Style preset" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={STYLE_NONE}>
                              Agent&apos;s choice
                            </SelectItem>
                            {STYLE_PRESETS.map((preset) => (
                              <SelectItem key={preset} value={preset}>
                                {preset}
                              </SelectItem>
                            ))}
                            <SelectItem value={STYLE_CUSTOM}>Custom…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectValue === STYLE_CUSTOM ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Custom style</Label>
                          <Input
                            value={entry.style ?? ""}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                style: event.target.value || undefined,
                              })
                            }
                            placeholder="Describe the style yourself"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-r-none"
                          disabled={generating}
                          title="Generate: prompt generator → Matrx Image Ultra"
                          onClick={() => void generate(entry, "two-step")}
                        >
                          {generating ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {entry.file_id ? "Regenerate" : "Generate"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-l-none border-l-0 px-1.5"
                              disabled={generating}
                              aria-label="More generation options"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onSelect={() => void generate(entry, "all-in-one")}
                            >
                              All-in-one (premium)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!imageAgentId}
                              title={
                                imageAgentId
                                  ? undefined
                                  : "Bind an agent to the Image producer role in surface config first"
                              }
                              onSelect={() => void generate(entry, "surface")}
                            >
                              Surface role agent
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() =>
                          openTaskWindow({
                            source: {
                              entity_type: "web_page",
                              entity_id: page.id,
                              label: page.path || page.url,
                            },
                            prePopulate: {
                              title: `Produce image — ${page.path || page.url}`,
                              description: buildSpec(entry),
                            },
                          })
                        }
                      >
                        <ListTodo className="mr-1.5 h-3.5 w-3.5" />
                        Task
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          desired.setDraft(
                            entries.filter((item) => item.id !== entry.id),
                          )
                        }
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DesiredSection>
      )}
    </SectionCard>
  );
}
