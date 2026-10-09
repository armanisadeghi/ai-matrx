"use client";

/**
 * "Add handles" for one competitor: pick a platform, type the handle, and it is tracked for that competitor
 * (the same intake door Track uses). Lives in the competitor's detail panel - the site-reading failure leads
 * here, so a site that blocks reading is never a dead end.
 */

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";

import type { BrandCompetitor } from "./brand-competitors";
import { COMPETITOR_SOCIAL_PLATFORMS, type CompetitorSocialPlatform } from "./social-links";
import { useCompetitorSocialActions, type BrandRef } from "./useCompetitorSocials";

export function AddHandlesForm({ row, brand }: { row: BrandCompetitor; brand: BrandRef }) {
  const { track } = useCompetitorSocialActions(brand);
  const [platform, setPlatform] = useState<CompetitorSocialPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = handle.trim();
    if (!value) return;
    setBusy(true);
    try {
      // The intake door reads a handle or a link; the link field carries whichever the person typed.
      const out = await track(row, [{ platform, url: value }]);
      if (out.tracked) {
        toast.success("Tracking that account");
        setHandle("");
      } else {
        toast.error("That account could not be added. Check the handle and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2" aria-label="Add handles">
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
      <Input aria-label="Handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or link" />
      <Button type="submit" variant="outline" disabled={!handle.trim() || busy} icon={busy ? <Loader2 className="animate-spin" /> : <UserPlus />}>
        Add
      </Button>
    </form>
  );
}
