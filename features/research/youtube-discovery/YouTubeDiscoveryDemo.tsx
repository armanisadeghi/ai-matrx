"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState, type ComponentProps } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  LoaderCircle,
  Maximize2,
  Play,
  Search,
  SlidersHorizontal,
  ThumbsUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Youtube } from "@/components/icons/brand-icons";
import { youTubeWatchUrl } from "@/lib/media/youtube";
import {
  formatYouTubeCount,
  formatYouTubeDate,
  formatYouTubeDuration,
  youTubeEngagementRate,
} from "./formatters";
import { searchYouTube } from "./service";
import {
  DEFAULT_YOUTUBE_SEARCH,
  type YouTubeSearchPage,
  type YouTubeSearchRequest,
  type YouTubeVideoCandidate,
} from "./types";
import { YouTubeVideoPreviewDialog } from "./YouTubeVideoPreview";

type FormState = YouTubeSearchRequest & {
  published_after: string;
  published_before: string;
  channel_id: string;
  topic_id: string;
  location: string;
  location_radius: string;
  video_category_id: string;
};

const INITIAL_FORM: FormState = {
  ...DEFAULT_YOUTUBE_SEARCH,
  published_after: "",
  published_before: "",
  channel_id: "",
  topic_id: "",
  location: "",
  location_radius: "",
  video_category_id: "",
};

const SELECT_CLASS =
  "h-10 rounded-xl border-border bg-background text-sm shadow-none focus:ring-cyan-400/30 dark:border-white/10 dark:bg-white/[0.04]";

type DurationChoice =
  "any" | "short" | "under10" | "under20" | "medium" | "long";

function selectedDuration(form: FormState): DurationChoice {
  if (form.max_duration_minutes === 10) return "under10";
  if (form.max_duration_minutes === 20) return "under20";
  return (form.video_duration ?? "any") as DurationChoice;
}

function compactRequest(
  form: FormState,
  pageToken?: string,
): YouTubeSearchRequest {
  return {
    ...form,
    query: form.query.trim(),
    page_token: pageToken,
    region_code: form.region_code?.trim() || undefined,
    relevance_language: form.relevance_language?.trim() || undefined,
    published_after: form.published_after || undefined,
    published_before: form.published_before || undefined,
    channel_id: form.channel_id.trim() || undefined,
    topic_id: form.topic_id.trim() || undefined,
    location: form.location.trim() || undefined,
    location_radius: form.location_radius.trim() || undefined,
    video_category_id: form.video_category_id.trim() || undefined,
  };
}

export function YouTubeDiscoveryDemo() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [page, setPage] = useState<YouTubeSearchPage | null>(null);
  const [selected, setSelected] = useState<YouTubeVideoCandidate | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const runSearch = async (pageToken?: string) => {
    if (!form.query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await searchYouTube(compactRequest(form, pageToken));
      setPage(result);
      setSelected(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "YouTube search could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-[#07090d] dark:text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(239,68,68,0.08),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(8,145,178,0.07),transparent_34%)] dark:bg-[radial-gradient(circle_at_10%_0%,rgba(239,68,68,0.13),transparent_32%),radial-gradient(circle_at_90%_20%,rgba(34,211,238,0.1),transparent_34%)]" />
      <div className="relative mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 pt-3 text-sm font-medium text-red-600 dark:text-red-400">
              <Youtube className="h-5 w-5" />
              YouTube intelligence
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              Find the signal in YouTube.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground dark:text-zinc-400 sm:text-base">
              Search videos, inspect creator authority and engagement, and open
              the strongest sources for deeper research.
            </p>
          </div>
          {page && (
            <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
              <span className="font-semibold text-foreground dark:text-white">
                {formatYouTubeCount(page.total_results)}
              </span>{" "}
              estimated matches
              {page.region_code ? ` · ${page.region_code}` : ""}
            </div>
          )}
        </header>

        <form
          onSubmit={onSubmit}
          className="mb-7 rounded-3xl border border-border bg-card/90 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/70 dark:shadow-black/30"
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-zinc-500" />
              <Input
                value={form.query}
                onChange={(event) => update("query", event.target.value)}
                placeholder="Search a topic, expert, question, or exact phrase…"
                className="h-14 rounded-2xl border-border bg-background pl-12 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-cyan-400/30 dark:border-white/10 dark:bg-white/[0.04] dark:placeholder:text-zinc-600"
                aria-label="YouTube search query"
              />
            </div>
            <Button
              type="submit"
              disabled={!form.query.trim() || loading}
              className="h-14 rounded-2xl bg-red-500 px-7 font-semibold text-white hover:bg-red-400"
            >
              {loading ? (
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Search className="mr-2 h-5 w-5" />
              )}
              Search YouTube
            </Button>
          </div>

          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-6 dark:border-white/10">
            <FilterSelect
              label="Sort by"
              value={form.order ?? "relevance"}
              onValueChange={(value) =>
                update("order", value as FormState["order"])
              }
              options={[
                ["relevance", "Most relevant"],
                ["viewCount", "Most viewed"],
                ["rating", "Highest rated"],
                ["date", "Newest"],
                ["title", "Title"],
              ]}
            />
            <FilterSelect
              label="Results"
              value={String(form.max_results)}
              onValueChange={(value) => update("max_results", Number(value))}
              options={[
                ["10", "10 videos"],
                ["25", "25 videos"],
                ["50", "50 videos"],
              ]}
            />
            <FilterSelect
              label="Duration"
              value={selectedDuration(form)}
              onValueChange={(value) => {
                if (value === "under10" || value === "under20") {
                  setForm((current) => ({
                    ...current,
                    video_duration: "any",
                    max_duration_minutes: value === "under10" ? 10 : 20,
                  }));
                  return;
                }
                setForm((current) => ({
                  ...current,
                  video_duration: value as FormState["video_duration"],
                  max_duration_minutes: undefined,
                }));
              }}
              options={[
                ["any", "Any length"],
                ["short", "Under 4 minutes"],
                ["under10", "Under 10 minutes"],
                ["under20", "Under 20 minutes"],
                ["medium", "4–20 minutes"],
                ["long", "Over 20 minutes"],
              ]}
            />
            <FilterSelect
              label="Captions"
              value={form.video_caption ?? "any"}
              onValueChange={(value) =>
                update("video_caption", value as FormState["video_caption"])
              }
              options={[
                ["any", "Any"],
                ["closedCaption", "Has captions"],
                ["none", "No captions"],
              ]}
            />
            <FilterSelect
              label="Per channel"
              value={String(form.max_results_per_channel ?? "any")}
              onValueChange={(value) =>
                update(
                  "max_results_per_channel",
                  value === "any" ? undefined : Number(value),
                )
              }
              options={[
                ["1", "1 video"],
                ["2", "2 videos"],
                ["3", "3 videos"],
                ["5", "5 videos"],
                ["10", "10 videos"],
                ["any", "No limit"],
              ]}
            />
            <button
              type="button"
              onClick={() => setAdvanced((current) => !current)}
              className="flex h-[62px] min-w-0 items-end justify-between rounded-2xl border border-border bg-muted/30 px-4 pb-2.5 text-left text-sm transition hover:bg-muted/60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <span>
                <span className="block text-[11px] uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">
                  Filters
                </span>
                <span className="mt-1 flex items-center gap-2 font-medium text-foreground dark:text-zinc-200">
                  <SlidersHorizontal className="h-4 w-4" />
                  Advanced
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition dark:text-zinc-500 ${advanced ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {advanced && <AdvancedFilters form={form} update={update} />}
          <p className="mt-3 px-1 text-xs text-muted-foreground dark:text-zinc-600">
            Power search: use{" "}
            <code className="text-foreground/70 dark:text-zinc-400">
              term1 | term2
            </code>{" "}
            for alternatives and{" "}
            <code className="text-foreground/70 dark:text-zinc-400">-term</code>{" "}
            to exclude a word.
          </p>
        </form>

        {error && (
          <div className="mb-7 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {!page && !loading && <EmptyState />}

        {page && page.results.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-14 text-center dark:border-white/15">
            <h2 className="text-lg font-semibold">No videos matched</h2>
            <p className="mt-2 text-sm text-muted-foreground dark:text-zinc-500">
              Try broadening the query or removing one of the advanced filters.
            </p>
          </div>
        )}

        {page && page.results.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground dark:text-zinc-500">
                Showing {page.results.length} enriched videos for{" "}
                <span className="text-foreground/80 dark:text-zinc-300">
                  “{page.query}”
                </span>
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {page.results.map((video, index) => (
                <VideoCard
                  key={video.video_id}
                  video={video}
                  eagerImage={index === 0}
                  onPreview={() => setSelected(video)}
                />
              ))}
            </div>
            <div className="mt-8 flex justify-center gap-3">
              <Button
                variant="outline"
                disabled={!page.prev_page_token || loading}
                onClick={() =>
                  void runSearch(page.prev_page_token ?? undefined)
                }
                className="rounded-xl border-border bg-card dark:border-white/10 dark:bg-white/[0.03]"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!page.next_page_token || loading}
                onClick={() =>
                  void runSearch(page.next_page_token ?? undefined)
                }
                className="rounded-xl border-border bg-card dark:border-white/10 dark:bg-white/[0.03]"
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {selected && (
        <YouTubeVideoPreviewDialog
          video={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-muted/30 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <Label className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-muted-foreground dark:text-zinc-500">
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-7 w-full min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AdvancedFilters({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-muted/20 p-4 dark:border-white/10 dark:bg-black/20">
      <div className="mb-4">
        <h2 className="font-medium">Advanced discovery</h2>
        <p className="mt-1 text-xs text-muted-foreground dark:text-zinc-500">
          Every control maps to a supported YouTube discovery filter.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextFilter
          label="Published after"
          type="datetime-local"
          value={form.published_after}
          onChange={(value) => update("published_after", value)}
        />
        <TextFilter
          label="Published before"
          type="datetime-local"
          value={form.published_before}
          onChange={(value) => update("published_before", value)}
        />
        <TextFilter
          label="Region"
          placeholder="US"
          maxLength={2}
          value={form.region_code ?? ""}
          onChange={(value) => update("region_code", value)}
        />
        <TextFilter
          label="Language"
          placeholder="en"
          value={form.relevance_language ?? ""}
          onChange={(value) => update("relevance_language", value)}
        />
        <TextFilter
          label="Channel ID"
          placeholder="UC…"
          value={form.channel_id}
          onChange={(value) => update("channel_id", value)}
        />
        <TextFilter
          label="Category ID"
          placeholder="e.g. 27"
          value={form.video_category_id}
          onChange={(value) => update("video_category_id", value)}
        />
        <TextFilter
          label="Topic ID"
          placeholder="/m/…"
          value={form.topic_id}
          onChange={(value) => update("topic_id", value)}
        />
        <FilterSelect
          label="Live status"
          value={form.event_type ?? "any"}
          onValueChange={(value) =>
            update(
              "event_type",
              value === "any" ? undefined : (value as FormState["event_type"]),
            )
          }
          options={[
            ["any", "Any"],
            ["live", "Live now"],
            ["upcoming", "Upcoming"],
            ["completed", "Completed"],
          ]}
        />
        <FilterSelect
          label="Quality"
          value={form.video_definition ?? "any"}
          onValueChange={(value) =>
            update("video_definition", value as FormState["video_definition"])
          }
          options={[
            ["any", "Any"],
            ["high", "High definition"],
            ["standard", "Standard definition"],
          ]}
        />
        <FilterSelect
          label="Dimension"
          value={form.video_dimension ?? "any"}
          onValueChange={(value) =>
            update("video_dimension", value as FormState["video_dimension"])
          }
          options={[
            ["any", "Any"],
            ["2d", "2D"],
            ["3d", "3D"],
          ]}
        />
        <FilterSelect
          label="License"
          value={form.video_license ?? "any"}
          onValueChange={(value) =>
            update("video_license", value as FormState["video_license"])
          }
          options={[
            ["any", "Any"],
            ["creativeCommon", "Creative Commons"],
            ["youtube", "Standard YouTube"],
          ]}
        />
        <FilterSelect
          label="Video type"
          value={form.video_type ?? "any"}
          onValueChange={(value) =>
            update("video_type", value as FormState["video_type"])
          }
          options={[
            ["any", "Any"],
            ["episode", "Episode"],
            ["movie", "Movie"],
          ]}
        />
        <TextFilter
          label="Location"
          placeholder="34.0522,-118.2437"
          value={form.location}
          onChange={(value) => update("location", value)}
        />
        <TextFilter
          label="Location radius"
          placeholder="25mi"
          value={form.location_radius}
          onChange={(value) => update("location_radius", value)}
        />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ToggleFilter
          label="Embeddable only"
          checked={form.video_embeddable === "true"}
          onCheckedChange={(checked) =>
            update("video_embeddable", checked ? "true" : "any")
          }
        />
        <ToggleFilter
          label="Playable outside YouTube"
          checked={form.video_syndicated === "true"}
          onCheckedChange={(checked) =>
            update("video_syndicated", checked ? "true" : "any")
          }
        />
        <ToggleFilter
          label="Paid placement"
          checked={form.video_paid_product_placement === "true"}
          onCheckedChange={(checked) =>
            update("video_paid_product_placement", checked ? "true" : "any")
          }
        />
      </div>
    </div>
  );
}

function TextFilter({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-muted-foreground dark:text-zinc-400">
        {label}
      </Label>
      <Input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      />
    </div>
  );
}

function ToggleFilter({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <Label className="text-xs text-foreground/80 dark:text-zinc-300">
        {label}
      </Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function VideoCard({
  video,
  eagerImage,
  onPreview,
}: {
  video: YouTubeVideoCandidate;
  eagerImage: boolean;
  onPreview: () => void;
}) {
  const engagement = youTubeEngagementRate(
    video.like_count,
    video.comment_count,
    video.view_count,
  );

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card transition duration-300 hover:-translate-y-1 hover:border-foreground/20 dark:border-white/10 dark:bg-zinc-950/75 dark:hover:border-white/20">
      <button
        type="button"
        onClick={onPreview}
        className="relative block aspect-video w-full overflow-hidden bg-muted text-left dark:bg-zinc-900"
        aria-label={`Preview ${video.title}`}
      >
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt=""
            fill
            loading={eagerImage ? "eager" : "lazy"}
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-red-500 text-white shadow-xl">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
        <span className="absolute bottom-3 right-3 rounded-md bg-black/80 px-2 py-1 text-xs font-medium">
          {formatYouTubeDuration(video.duration)}
        </span>
      </button>
      <div className="p-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-red-600 dark:text-red-400">
          {video.channel_title ?? "YouTube creator"}
        </p>
        <h2 className="line-clamp-2 min-h-12 text-base font-semibold leading-6">
          {video.title}
        </h2>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground dark:text-zinc-500">
          {video.description || "No description supplied."}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 dark:border-white/10">
          <Metric
            icon={Eye}
            value={formatYouTubeCount(video.view_count)}
            label="views"
          />
          <Metric
            icon={ThumbsUp}
            value={formatYouTubeCount(video.like_count)}
            label="likes"
          />
          <Metric
            icon={Users}
            value={formatYouTubeCount(video.channel_subscriber_count)}
            label="subscribers"
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground dark:text-zinc-500">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatYouTubeDate(video.published_at)}
          </span>
          {engagement !== null && (
            <span>{engagement.toFixed(2)}% engagement</span>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={onPreview}
            className="flex-1 rounded-xl bg-foreground text-background hover:bg-foreground/85 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Play className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-border bg-transparent dark:border-white/10"
          >
            <Link
              href={`/demos/youtube-discovery/videos/${video.video_id}`}
              aria-label={`Open dedicated preview for ${video.title}`}
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-border bg-transparent dark:border-white/10"
          >
            <a
              href={youTubeWatchUrl(video.video_id)}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on YouTube"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <CopyButton
            content={youTubeWatchUrl(video.video_id)}
            tooltip="Copy YouTube link"
            size="icon"
            className="h-10 w-10 rounded-xl border border-border bg-transparent px-0 dark:border-white/10"
          />
        </div>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Eye;
  value: string;
  label: string;
}) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground/90 dark:text-zinc-200">
        <Icon className="h-3.5 w-3.5 text-muted-foreground dark:text-zinc-500" />
        {value}
      </span>
      <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground dark:text-zinc-600">
        {label}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {[
        [
          "Discover expertise",
          "Find creators and videos around a topic, question, or exact phrase.",
        ],
        [
          "Compare authority",
          "See views, engagement, channel scale, duration, captions, and publication date.",
        ],
        [
          "Go deeper",
          "Preview a source immediately, then carry the strongest videos into research.",
        ],
      ].map(([title, description], index) => (
        <div
          key={title}
          className="rounded-3xl border border-border bg-card/70 p-6 dark:border-white/10 dark:bg-white/[0.025]"
        >
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">
            0{index + 1}
          </span>
          <h2 className="mt-7 text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-zinc-500">
            {description}
          </p>
        </div>
      ))}
    </section>
  );
}
