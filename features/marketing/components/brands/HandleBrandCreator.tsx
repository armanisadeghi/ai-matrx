"use client";

/**
 * Add brand from a social handle — the person path (a creator who IS the
 * brand) and the company path started from a handle instead of a website.
 *
 *   start → look up (streams) → confirm (prefilled; discovered accounts) → create → track? → open
 *
 * Logic and order: `lib/person-brand-flow.ts`; I/O: `lib/person-brand-io.ts`.
 * Every failure is shown where it happened with a way forward; nothing dead-ends.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Loader2, Search, UserRound } from "lucide-react";
import { Button, Field, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import { formatCount } from "@ai-matrx/kit/format";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { BRAND_KIND_COPY, type BrandKind } from "@/features/marketing/lib/brand-kind";
import { linkLabel, type DiscoveredAccount } from "@/features/marketing/lib/link-in-bio";
import {
  classifyStartInput,
  createPersonBrand,
  discoverPresence,
  planPersonBrand,
  type CreatedPersonBrand,
  type Discovery,
  type SeedProfile,
} from "@/features/marketing/lib/person-brand-flow";
import {
  lookUpSeedProfile,
  personBrandDeps,
  scrapeLinkInBio,
} from "@/features/marketing/lib/person-brand-io";
import { profileAvatarDoor, socialErrorMessage, trackAccount } from "@/features/marketing/social/server";
import { useSocialSpend } from "@/features/marketing/social/cost";
import { PlatformMark, platformLabel } from "@/features/marketing/social/components/PlatformMark";
import { SocialImage } from "@/features/marketing/social/components/SocialImage";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKABLE_PLATFORMS,
  type SocialPlatform,
} from "@/features/marketing/social/types";

type Step = "start" | "looking" | "confirm" | "creating" | "track" | "tracking";

const HANDLE_PLATFORMS: SelectOption<SocialPlatform>[] = (
  ["instagram", "tiktok", "youtube", "x", "threads", "linkedin", "facebook"] as const
).map((p) => ({ value: p, label: SOCIAL_PLATFORM_LABELS[p] }));

type TrackState = { state: "idle" | "running" | "ok" | "failed"; message: string | null };

export function HandleBrandCreator({
  kind,
  organizationId,
  onClose,
  onLocked,
}: {
  kind: BrandKind;
  organizationId: string | undefined;
  onClose: () => void;
  /** True once a lookup started: the kind can no longer change under a profile in hand. */
  onLocked?: (locked: boolean) => void;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const userId = useAppSelector(selectUserId);
  const spend = useSocialSpend(organizationId);
  const copy = BRAND_KIND_COPY[kind];

  const [step, setStep] = useState<Step>("start");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [name, setName] = useState("");
  const [websiteTyped, setWebsiteTyped] = useState("");
  const [progress, setProgress] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const [seed, setSeed] = useState<SeedProfile | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [website, setWebsite] = useState<string>("");
  const [isMe, setIsMe] = useState(false);
  const [created, setCreated] = useState<CreatedPersonBrand | null>(null);
  const [tracking, setTracking] = useState<Record<string, TrackState>>({});

  const startKind = classifyStartInput(handle);
  const keyOf = (a: { platform: string; handle: string }) => `${a.platform}:${a.handle.toLowerCase()}`;
  const say = (line: string) => setProgress((p) => (p[p.length - 1] === line ? p : [...p, line]));

  const lookUp = async () => {
    setFailure(null);
    if (!organizationId) return setFailure("Choose an owning organization first.");
    if (startKind === "empty") return setFailure("Paste a social handle or profile link.");
    if (startKind === "website") {
      return setFailure("That is a website. Paste a social profile, or use the website form.");
    }
    setStep("looking");
    onLocked?.(true);
    setProgress([]);
    try {
      say("Fetching the profile");
      const profile = await lookUpSeedProfile({
        handleOrUrl: handle,
        platform: startKind === "handle" ? platform : undefined,
        organizationId,
        onProgress: (p) => say(p.message),
      });
      setSeed(profile);
      setName((n) => n.trim() || profile.displayName);
      say(profile.externalUrl ? `Reading the bio link ${linkLabel(profile.externalUrl)}` : "Reading the bio");
      const found = await discoverPresence(profile, { scrape: (url) => scrapeLinkInBio(url, dispatch) });
      setDiscovery(found);
      setChosen(new Set(found.accounts.map(keyOf)));
      setWebsite(websiteTyped.trim() || found.website || "");
      setStep("confirm");
    } catch (error) {
      setFailure(socialErrorMessage(error, "The profile could not be fetched."));
      setStep("start");
      onLocked?.(false);
    }
  };

  const create = async () => {
    if (!seed || !discovery || !organizationId) return;
    setFailure(null);
    setStep("creating");
    try {
      const plan = planPersonBrand({
        kind,
        organizationId,
        name,
        seed,
        chosen: discovery.accounts.filter((a) => chosen.has(keyOf(a))),
        website: website.trim() || null,
        selfUserId: kind === "person" && isMe ? userId : null,
      });
      const result = await createPersonBrand(plan, seed, personBrandDeps);
      setCreated(result);
      void queryClient.invalidateQueries({ queryKey: [...marketingKeys.root, "brands"] });
      const failed = result.properties.filter((p) => p.error);
      if (failed.length) {
        toast.error(`${failed.length} account${failed.length === 1 ? "" : "s"} not added`, {
          description: failed.map((f) => `${platformLabel(f.platform)} @${f.handle}: ${f.error}`).join(" · "),
        });
      }
      setTracking(
        Object.fromEntries(result.properties.filter((p) => p.propertyId).map((p) => [keyOf(p), { state: "idle", message: null }])),
      );
      setStep("track");
    } catch (error) {
      setFailure(`Could not create the brand: ${extractErrorMessage(error)}`);
      setStep("confirm");
    }
  };

  const trackable = (created?.properties ?? []).filter((p) => p.propertyId && TRACKABLE_PLATFORMS.has(p.platform));

  const openBrand = () => {
    if (!created) return;
    onClose();
    router.push(marketingRoutes.brand(marketingSeg(created.brand)));
  };

  const trackAll = async () => {
    if (!created || !organizationId) return;
    const ok = await spend.confirmSpend("track", trackable.length, {
      title: `Track ${trackable.length} account${trackable.length === 1 ? "" : "s"}?`,
      confirmLabel: "Track",
    });
    if (!ok) return;
    setStep("tracking");
    for (const p of trackable) {
      const key = keyOf(p);
      setTracking((t) => ({ ...t, [key]: { state: "running", message: "Starting" } }));
      try {
        await trackAccount(
          {
            ...(p.platform === seed?.platform && p.handle === seed?.handle
              ? { profileId: seed.profileId }
              : { handleOrUrl: p.url ?? p.handle, platform: p.platform as SocialPlatform }),
            role: "own",
            brandId: created.brand.id,
            propertyId: p.propertyId ?? undefined,
            allowEmpty: true,
          },
          {
            organizationId,
            onProgress: (pr) => setTracking((t) => ({ ...t, [key]: { state: "running", message: pr.message } })),
          },
        );
        setTracking((t) => ({ ...t, [key]: { state: "ok", message: null } }));
      } catch (error) {
        setTracking((t) => ({ ...t, [key]: { state: "failed", message: socialErrorMessage(error, "Not tracked") } }));
      }
    }
    setStep("track");
  };

  const trackCost = spend.costText("track", Math.max(trackable.length, 1));
  const lookCost = spend.costText("profile_page", 1);

  if (step === "start" || step === "looking") {
    const busy = step === "looking";
    return (
      <div className="grid gap-3" data-testid="handle-brand-start">
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="space-y-1">
            <Label htmlFor="handle-brand-handle" className="text-xs">
              Social handle or profile link
            </Label>
            <Field
              id="handle-brand-handle"
              value={handle}
              disabled={busy}
              onChange={(event) => setHandle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void lookUp();
              }}
              placeholder="instagram.com/name or @name"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Platform</Label>
            {startKind === "social" ? (
              <p className="flex h-7 items-center text-sm text-muted-foreground">From the link</p>
            ) : (
              <Select
                aria-label="Platform"
                value={platform}
                onValueChange={setPlatform}
                options={HANDLE_PLATFORMS}
                disabled={busy}
              />
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="handle-brand-name" className="text-xs">
              Name
            </Label>
            <Field
              id="handle-brand-name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Filled from the profile"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="handle-brand-website" className="text-xs">
              Website (optional)
            </Label>
            <Field
              id="handle-brand-website"
              value={websiteTyped}
              disabled={busy}
              onChange={(event) => setWebsiteTyped(event.target.value)}
              placeholder="Found from the bio link"
            />
          </div>
        </div>
        {busy ? (
          <ol className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground" aria-live="polite">
            {progress.map((line, i) => (
              <li key={`${i}:${line}`} className="flex items-center gap-2">
                {i === progress.length - 1 ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-3 w-3 text-success" aria-hidden />
                )}
                {line}
              </li>
            ))}
          </ol>
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {lookCost ? <span className="text-xs text-muted-foreground">{lookCost}</span> : null}
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || startKind === "empty"}
            icon={busy ? <Loader2 className="animate-spin" /> : <Search />}
            onClick={() => void lookUp()}
          >
            Look up
          </Button>
        </div>
      </div>
    );
  }

  if ((step === "confirm" || step === "creating") && seed && discovery) {
    const busy = step === "creating";
    const websiteOptions = [
      ...new Set([discovery.website, websiteTyped.trim(), ...discovery.links].filter((v): v is string => Boolean(v))),
    ].slice(0, 8);
    return (
      <div className="grid gap-3" data-testid="handle-brand-confirm">
        <SeedHeader seed={seed} />
        <div className="space-y-1">
          <Label htmlFor="handle-brand-name-confirm" className="text-xs">
            Name
          </Label>
          <Field
            id="handle-brand-name-confirm"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Accounts</Label>
            <span className="text-[11px] text-muted-foreground" title={discovery.hubError ?? undefined}>
              {discovery.hub
                ? discovery.hubError
                  ? `Could not read ${linkLabel(discovery.hub)}`
                  : `Found on ${linkLabel(discovery.hub)}`
                : "No bio link to read"}
            </span>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            <AccountRowView
              account={{ platform: seed.platform, handle: seed.handle, url: seed.profileUrl }}
              checked
              locked
            />
            {discovery.accounts.map((a) => (
              <AccountRowView
                key={keyOf(a)}
                account={a}
                checked={chosen.has(keyOf(a))}
                disabled={busy}
                onChange={(on) =>
                  setChosen((c) => {
                    const next = new Set(c);
                    if (on) next.add(keyOf(a));
                    else next.delete(keyOf(a));
                    return next;
                  })
                }
              />
            ))}
          </ul>
          {discovery.accounts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No other accounts found. Add more on Socials later.</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="handle-brand-website-confirm" className="text-xs">
            Website (optional)
          </Label>
          <Field
            id="handle-brand-website-confirm"
            value={website}
            disabled={busy}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="None"
          />
          {websiteOptions.length ? (
            <div className="flex flex-wrap gap-1">
              {websiteOptions.map((link) => (
                <button
                  key={link}
                  type="button"
                  disabled={busy}
                  onClick={() => setWebsite(link)}
                  className="max-w-[16rem] truncate rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                  title={link}
                >
                  {linkLabel(link)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {kind === "person" ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isMe} disabled={busy || !userId} onCheckedChange={(v) => setIsMe(v === true)} />
            This is me
            <span className="text-[11px] text-muted-foreground">Their voice becomes your own</span>
          </label>
        ) : null}

        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="quiet"
            disabled={busy}
            icon={<ArrowLeft />}
            onClick={() => {
              setStep("start");
              setFailure(null);
              onLocked?.(false);
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            disabled={busy || !name.trim()}
            icon={busy ? <Loader2 className="animate-spin" /> : null}
            onClick={() => void create()}
          >
            {`Create ${copy.label.toLowerCase()} brand`}
          </Button>
        </div>
      </div>
    );
  }

  if ((step === "track" || step === "tracking") && created) {
    const busy = step === "tracking";
    const anyDone = Object.values(tracking).some((t) => t.state === "ok" || t.state === "failed");
    return (
      <div className="grid gap-3" data-testid="handle-brand-track">
        <p className="text-sm text-foreground">
          {created.brand.name} is created with {created.properties.filter((p) => p.propertyId).length} account
          {created.properties.filter((p) => p.propertyId).length === 1 ? "" : "s"}.
        </p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {created.properties.map((p) => {
            const t = tracking[keyOf(p)];
            const canTrack = TRACKABLE_PLATFORMS.has(p.platform);
            return (
              <li key={keyOf(p)} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <PlatformMark platform={p.platform} size={16} />
                <span className="truncate">@{p.handle}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground" title={p.error ?? t?.message ?? undefined}>
                  {p.error
                    ? "Not added"
                    : !canTrack
                      ? "Can't track yet"
                      : t?.state === "running"
                        ? (t.message ?? "Tracking")
                        : t?.state === "ok"
                          ? "Tracked"
                          : t?.state === "failed"
                            ? (t.message ?? "Not tracked")
                            : "Not tracked"}
                </span>
                {t?.state === "running" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-end gap-2">
          {!anyDone && trackCost ? <span className="text-xs text-muted-foreground">{trackCost}</span> : null}
          <Button variant="quiet" disabled={busy} onClick={openBrand}>
            {anyDone ? "Open brand" : "Skip, open brand"}
          </Button>
          {!anyDone && trackable.length ? (
            <Button
              variant="primary"
              disabled={busy}
              icon={busy ? <Loader2 className="animate-spin" /> : null}
              onClick={() => void trackAll()}
            >
              {`Track ${trackable.length}`}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}

function SeedHeader({ seed }: { seed: SeedProfile }) {
  return (
    <div className="flex gap-3 rounded-md border border-border p-2">
      <SocialImage
        door={seed.avatarFileId ? profileAvatarDoor(seed.profileId) : null}
        url={seed.avatarUrl}
        alt={seed.displayName}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        fallback={
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PlatformMark platform={seed.platform} size={14} />
          <span className="truncate text-sm font-medium">{seed.displayName}</span>
          <span className="truncate text-xs text-muted-foreground">@{seed.handle}</span>
          {seed.followers != null ? (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatCount(seed.followers)} followers</span>
          ) : null}
        </div>
        {seed.bio ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{seed.bio}</p> : null}
      </div>
    </div>
  );
}

function AccountRowView({
  account,
  checked,
  locked = false,
  disabled = false,
  onChange,
}: {
  account: DiscoveredAccount;
  checked: boolean;
  locked?: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <Checkbox
        checked={checked}
        disabled={locked || disabled}
        onCheckedChange={(v) => onChange?.(v === true)}
        aria-label={`Add ${platformLabel(account.platform)} @${account.handle}`}
      />
      <PlatformMark platform={account.platform} size={16} />
      <span className="truncate">@{account.handle}</span>
      <span className="text-xs text-muted-foreground">{platformLabel(account.platform)}</span>
      {locked ? <span className="text-[11px] text-muted-foreground">Looked up</span> : null}
      <a
        href={account.url}
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-muted-foreground hover:text-foreground"
        aria-label={`Open ${account.url}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </li>
  );
}
