"use client";

/**
 * "Add handles" for one competitor: type a handle or paste a link, and it is tracked for that competitor
 * (the same intake door Track uses). Lives in the competitor's detail panel - the site-reading failure leads
 * here, so a site that blocks reading is never a dead end. The platform follows a pasted link.
 */

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { SocialAccountInput, useSocialAccountInput } from "@/features/marketing/social/components/SocialAccountInput";

import type { BrandCompetitor } from "./brand-competitors";
import { COMPETITOR_SOCIAL_PLATFORMS, type CompetitorSocialPlatform } from "./social-links";
import { useCompetitorSocialActions, type BrandRef } from "./useCompetitorSocials";

export function AddHandlesForm({ row, brand }: { row: BrandCompetitor; brand: BrandRef }) {
  const { track } = useCompetitorSocialActions(brand);
  const [platform, setPlatform] = useState<CompetitorSocialPlatform>("instagram");
  const [busy, setBusy] = useState(false);
  const input = useSocialAccountInput({ contextPlatform: platform, organizationId: brand.organizationId });
  const { parsed } = input;

  // A pasted link names its own platform: the picker follows it.
  useEffect(() => {
    if (parsed.status !== "ok" || !parsed.detected) return;
    const known = COMPETITOR_SOCIAL_PLATFORMS.find((p) => p.id === parsed.platform);
    if (known && known.id !== platform) setPlatform(known.id);
  }, [parsed, platform]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.account) return;
    setBusy(true);
    try {
      const out = await track(row, [{ platform, url: input.account.url }]);
      if (out.tracked) {
        toast.success("Tracking that account");
        input.reset();
      } else {
        toast.error("That account could not be added. Check the handle and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-start gap-2" aria-label="Add handles">
      <select
        aria-label="Platform"
        value={platform}
        onChange={(e) => setPlatform(e.target.value as CompetitorSocialPlatform)}
        className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-base text-foreground"
      >
        {COMPETITOR_SOCIAL_PLATFORMS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <SocialAccountInput input={input} className="min-w-0 flex-1" />
      <Button type="submit" variant="outline" disabled={!input.account || busy} icon={busy ? <Loader2 className="animate-spin" /> : <UserPlus />}>
        Add
      </Button>
    </form>
  );
}
