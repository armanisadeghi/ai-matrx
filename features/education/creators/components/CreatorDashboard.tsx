"use client";

// features/education/creators/components/CreatorDashboard.tsx
//
// The authed creator manage surface (/education/creator). Claim a handle, edit
// the public identity, pick which YouTube videos + free tools + classes to
// feature, and publish. DIRECT supabase RPC path (features/education/creators/
// service.ts) — no Next.js middle tier. Reuses useClasses (the canonical class
// list) for the class picker; the public page is force-dynamic so edits show on
// the next load with no cache bust.

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Check,
  ExternalLink,
  GraduationCap,
  Layers,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
  Video,
  ChevronUp,
  ChevronDown,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useClasses } from "@/features/education/classes/hooks/useClasses";
import { EDU_ORIGIN } from "@/features/education/constants";
import {
  claimHandle,
  getMyCreatorProfile,
  isHandleAvailable,
  listMyPublicResources,
  setCreatorPublic,
  updateCreatorProfile,
  type OwnedPublicResource,
} from "../service";
import { parseYouTubeId } from "../youtube";
import { CreatorPayoutsPanel } from "./CreatorPayoutsPanel";
import { formatPriceCents } from "@/lib/stripe/connect";
import type {
  CreatorLink,
  CreatorProfileMine,
  FeaturedClass,
  FeaturedItem,
  FeaturedResource,
  FeaturedYouTube,
} from "../types";

const RESOURCE_LABEL: Record<string, string> = {
  fc_set: "Flashcards",
  learn_doc: "Study guide",
  note: "Notes",
  study_media: "Media",
};

function featuredKey(item: FeaturedItem, i: number): string {
  if (item.kind === "youtube") return `yt:${item.videoId}:${i}`;
  if (item.kind === "resource") return `res:${item.resourceType}:${item.id}`;
  return `cls:${item.classId}`;
}

// ── Claim gate ────────────────────────────────────────────────────────────────
function ClaimHandle({ onClaimed }: { onClaimed: (p: CreatorProfileMine) => void }) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const h = handle.trim();
    if (h.length < 3) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const ok = await isHandleAvailable(h);
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [handle]);

  async function claim() {
    setClaiming(true);
    try {
      const p = await claimHandle(handle.trim(), displayName.trim() || undefined);
      if (p) {
        toast.success(`Handle @${p.handle} is yours`);
        onClaimed(p);
      }
    } catch (e) {
      toast.error("Could not claim handle", {
        description: e instanceof Error ? e.message : "Try another handle.",
      });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <BadgeCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold text-foreground">Become a creator</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Claim your public handle. You&apos;ll get a page at{" "}
          <span className="font-mono text-foreground">{new URL(EDU_ORIGIN).host}/c/your-handle</span> to
          feature your videos, free study tools, and classes.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="handle">Handle</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/c/</span>
              <Input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="ms-rivera"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span className="w-5 shrink-0">
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : available === true ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : available === false ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : null}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              3–30 characters — letters, numbers, dashes.
              {available === false ? (
                <span className="ml-1 text-destructive">Taken or invalid.</span>
              ) : null}
            </p>
          </div>

          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              className="mt-1.5"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ms. Rivera"
            />
          </div>

          <Button
            className="w-full"
            disabled={claiming || available !== true}
            onClick={claim}
          >
            {claiming ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-1.5 h-4 w-4" />}
            Claim @{handle.trim() || "handle"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Featured item row ─────────────────────────────────────────────────────────
function FeaturedRow({
  item,
  onUp,
  onDown,
  onRemove,
  isFirst,
  isLast,
}: {
  item: FeaturedItem;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  let icon = <Sparkles className="h-4 w-4 text-primary" />;
  let title = "";
  let sub = "";
  if (item.kind === "youtube") {
    icon = <Video className="h-4 w-4 text-red-500" />;
    title = item.title || "YouTube video";
    sub = item.videoId;
  } else if (item.kind === "resource") {
    icon = item.resourceType === "learn_doc" ? <BookOpen className="h-4 w-4 text-primary" /> : <Layers className="h-4 w-4 text-primary" />;
    title = item.title || RESOURCE_LABEL[item.resourceType] || "Resource";
    sub = `${RESOURCE_LABEL[item.resourceType] ?? item.resourceType} · Free`;
  } else {
    icon = <GraduationCap className="h-4 w-4 text-primary" />;
    title = item.title;
    sub = item.accessMode === "paid" ? `Class · $${item.price ?? "?"}` : `Class · ${item.accessMode}`;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={onUp}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={onDown}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────
function Editor({ initial }: { initial: CreatorProfileMine }) {
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [links, setLinks] = useState<CreatorLink[]>(initial.links ?? []);
  const [featured, setFeatured] = useState<FeaturedItem[]>(initial.featured ?? []);
  const [isPublic, setIsPublic] = useState(initial.is_public);
  const [saving, setSaving] = useState(false);
  const [ytInput, setYtInput] = useState("");

  const { classes } = useClasses();
  const [myResources, setMyResources] = useState<OwnedPublicResource[]>([]);
  useEffect(() => {
    void listMyPublicResources().then(setMyResources).catch(() => setMyResources([]));
  }, []);

  const handle = initial.handle!;

  const move = useCallback((i: number, dir: -1 | 1) => {
    setFeatured((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const removeAt = useCallback((i: number) => {
    setFeatured((prev) => prev.filter((_, idx) => idx !== i));
  }, []);

  function addYouTube() {
    const id = parseYouTubeId(ytInput);
    if (!id) {
      toast.error("Not a valid YouTube link or ID");
      return;
    }
    if (featured.some((f) => f.kind === "youtube" && f.videoId === id)) {
      toast.info("That video is already featured");
      setYtInput("");
      return;
    }
    const item: FeaturedYouTube = { kind: "youtube", videoId: id };
    setFeatured((p) => [...p, item]);
    setYtInput("");
  }

  function addResource(r: OwnedPublicResource) {
    if (featured.some((f) => f.kind === "resource" && f.resourceType === r.resourceType && f.id === r.id)) {
      toast.info("Already featured");
      return;
    }
    const item: FeaturedResource = { kind: "resource", resourceType: r.resourceType, id: r.id, title: r.title };
    setFeatured((p) => [...p, item]);
  }

  function addClass(classId: string, name: string) {
    if (featured.some((f) => f.kind === "class" && f.classId === classId)) {
      toast.info("Already featured");
      return;
    }
    const item: FeaturedClass = { kind: "class", classId, title: name, accessMode: "open", price: null };
    setFeatured((p) => [...p, item]);
  }

  async function save() {
    setSaving(true);
    try {
      await updateCreatorProfile({
        displayName: displayName.trim() || undefined,
        tagline,
        bio,
        links,
        featured,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function togglePublic(next: boolean) {
    setIsPublic(next);
    try {
      await setCreatorPublic(next);
      toast.success(next ? "Your page is live" : "Your page is unpublished");
    } catch (e) {
      setIsPublic(!next);
      toast.error("Could not update", { description: e instanceof Error ? e.message : undefined });
    }
  }

  const availableResources = myResources.filter(
    (r) => !featured.some((f) => f.kind === "resource" && f.resourceType === r.resourceType && f.id === r.id),
  );
  const availableClasses = classes.filter(
    (c) => !featured.some((f) => f.kind === "class" && f.classId === c.id),
  );
  const featuredClasses = featured.filter((f): f is FeaturedClass => f.kind === "class");

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Creator page</h1>
          <a
            href={`/c/${handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            /c/{handle}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="public" checked={isPublic} onCheckedChange={togglePublic} />
            <Label htmlFor="public" className="text-sm">
              {isPublic ? "Public" : "Draft"}
            </Label>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/c/${handle}`} target="_blank" rel="noopener noreferrer">
              <Eye className="mr-1.5 h-4 w-4" />
              View
            </a>
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* Identity */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" className="mt-1.5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tag">Tagline</Label>
            <Input id="tag" className="mt-1.5" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="What you teach, in one line" />
          </div>
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" className="mt-1.5" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell visitors who you are." />
        </div>
        {/* Links */}
        <div>
          <Label>Links (YouTube channel, socials, website)</Label>
          <div className="mt-1.5 space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={l.label}
                  onChange={(e) => setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="YouTube"
                  className="w-32 shrink-0"
                />
                <Input
                  value={l.url}
                  onChange={(e) => setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://youtube.com/@you"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLinks((p) => [...p, { label: "", url: "" }])}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add link
            </Button>
          </div>
        </div>
      </section>

      {/* Featured content */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Featured on your page</h2>

        {/* Add YouTube */}
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 shrink-0 text-red-500" />
          <Input
            value={ytInput}
            onChange={(e) => setYtInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addYouTube()}
            placeholder="Paste a YouTube link or video ID"
          />
          <Button variant="outline" size="sm" className="shrink-0" onClick={addYouTube}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add video
          </Button>
        </div>

        {/* Featured list */}
        {featured.length > 0 ? (
          <div className="space-y-2">
            {featured.map((item, i) => (
              <div key={featuredKey(item, i)}>
                <FeaturedRow
                  item={item}
                  isFirst={i === 0}
                  isLast={i === featured.length - 1}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  onRemove={() => removeAt(i)}
                />
                {item.kind === "class" ? (() => {
                  // Access mode + price are single-sourced from the class settings
                  // (edited in the class form). Shown read-only here so the page
                  // CTA can never diverge from what the owner actually set.
                  const live = classes.find((c) => c.id === item.classId);
                  const mode = live?.settings.accessMode ?? item.accessMode;
                  const cents = live?.settings.priceCents;
                  return (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-11 text-xs text-muted-foreground">
                      <span className="capitalize text-foreground">{mode}</span>
                      {mode === "paid" ? (
                        <span>· {cents ? formatPriceCents(cents) : "set a price in class settings"}</span>
                      ) : null}
                      <span className="text-muted-foreground/70">· manage in the class settings</span>
                    </div>
                  );
                })() : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nothing featured yet. Add videos, your public flashcard sets and guides, or your classes.
          </p>
        )}

        {/* Add resources */}
        {availableResources.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Your public free tools</p>
            <div className="flex flex-wrap gap-2">
              {availableResources.map((r) => (
                <button
                  key={`${r.resourceType}:${r.id}`}
                  onClick={() => addResource(r)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <Plus className="h-3 w-3" />
                  {r.title}
                  <span className="text-muted-foreground">· {RESOURCE_LABEL[r.resourceType] ?? r.resourceType}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Make a flashcard set or study guide public to feature it here as a free tool.
          </p>
        )}

        {/* Add classes */}
        {availableClasses.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Your classes</p>
            <div className="flex flex-wrap gap-2">
              {availableClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addClass(c.id, c.name)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <Plus className="h-3 w-3" />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {featuredClasses.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Set a class to <span className="font-medium text-foreground">Paid</span> with a price in
            its settings, then connect Stripe below to sell enrolments. The enroll button is live.
          </p>
        ) : null}
      </section>

      {/* Earnings & payouts (Stripe Connect) */}
      <CreatorPayoutsPanel />
    </div>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────
export function CreatorDashboard() {
  const [profile, setProfile] = useState<CreatorProfileMine | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getMyCreatorProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !profile?.handle ? (
          <ClaimHandle onClaimed={setProfile} />
        ) : (
          <Editor initial={profile} />
        )}
      </div>
    </div>
  );
}
