"use client";

/**
 * PageImagePlanCard — plan the images this page SHOULD have: per-planned-
 * image description, alt text, placement, and status, saved in
 * `desired_values.image_plan` through the shared slice contract. Each entry
 * can be generated directly by the surface's `image_producer` agent
 * (headless run → durable file_id back onto the entry, rendered via the
 * canonical media pipeline) or turned into a task.
 *
 * NOTE: the scraper currently stores only image COUNTS ({count, missing_alt})
 * — there is no observed per-image inventory to mirror yet. When the crawler
 * starts persisting the real <img> list, the observed side lands here.
 */

import { useState } from "react";
import { ImagePlus, ListTodo, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { MARKETING_PAGE_SURFACE_NAME } from "@/features/marketing/lib/marketing-page-scope";
import { generatePageImage } from "@/features/marketing/lib/generate-page-image";
import { useAppDispatch } from "@/lib/redux/hooks";
import type {
  DesiredImagePlanEntry,
  MarketingPage,
} from "@/features/marketing/types";

const IMAGE_PRODUCER_ROLE = "image_producer";

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

  const updateEntry = (id: string, patch: Partial<DesiredImagePlanEntry>) => {
    desired.setDraft(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  const buildSpec = (entry: DesiredImagePlanEntry) =>
    [
      `Generate ONE image for the web page ${page.url} (path ${page.path || "/"}).`,
      `Description: ${entry.description || "(none provided)"}`,
      entry.alt ? `Intended alt text: ${entry.alt}` : null,
      entry.placement ? `Placement on the page: ${entry.placement}` : null,
      "Return the image itself as your output.",
    ]
      .filter(Boolean)
      .join("\n");

  const generate = async (entry: DesiredImagePlanEntry) => {
    if (!imageAgentId) return;
    if (!entry.description.trim()) {
      toast.error("Describe the image before generating it.");
      return;
    }
    setGeneratingId(entry.id);
    try {
      const fileId = await dispatch(
        generatePageImage({
          agentId: imageAgentId,
          prompt: buildSpec(entry),
          surfaceKey: MARKETING_PAGE_SURFACE_NAME,
        }),
      );
      if (!fileId) {
        toast.error("Image generation returned no image", {
          description:
            "The agent run finished without an image output. Check the agent bound to the Image producer role.",
        });
        return;
      }
      // Persist immediately — a generated artifact must never sit only in
      // local state. Save the whole plan with the updated entry.
      const nextEntries = entries.map((item) =>
        item.id === entry.id
          ? { ...item, file_id: fileId, status: "generated" as const }
          : item,
      );
      desired.setDraft(nextEntries);
      await desired.save();
      toast.success("Image generated and saved to the plan");
    } finally {
      setGeneratingId(null);
    }
  };

  const copy = webCopy({
    kind: "web-page-image-plan",
    label: "Image plan",
    description:
      "The planned images for this page: descriptions, alt text, placement, status, and generated file ids.",
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
            then generate them with the Image producer agent or hand them off
            as tasks.
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={!imageAgentId || generating}
                        title={
                          imageAgentId
                            ? "Generate this image with the Image producer agent"
                            : "Bind an agent to the Image producer role in surface config first"
                        }
                        onClick={() => void generate(entry)}
                      >
                        {generating ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {entry.file_id ? "Regenerate" : "Generate"}
                      </Button>
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
