"use client";

/**
 * THE PLACES WORKSPACE — the unified-management preview for ONE place.
 *
 * Arman, ruling R13: the Surface UI is "likely the best" but "missing a few
 * things it needs so that it can handle everything that shortcuts need". This
 * mockup is that extension, shown on one real-shaped place — the CRM Contact
 * Page — so the structure can be judged before anything is built.
 *
 * The page is the Surface admin's skeleton, kept: a completeness strip, a
 * merged manifest, and the panels that hang off a place. What is added is the
 * discovered half of THE-MODEL — known-value alignment on every manifest row,
 * an auto-run control that belongs to the person rather than the code, and a
 * per-place preview of the jobs that find this page without anyone naming them.
 *
 * 5. THE SCOPE SWITCHER is the altitude pattern the surfaces user hub already
 * proved: the SAME place, seen from the tier your writes will land in. Admin
 * altitude owns code-vs-DB truth; user altitude owns the choices that are
 * genuinely the user's — holder, auto-run, exclusion — and never shows a
 * control that would 42501.
 */

import { useState } from "react";
import { ExternalLink, Layers, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { BindingsPanel } from "./BindingsPanel";
import { CompletenessStrip } from "./CompletenessStrip";
import { DiscoveredMandatesPanel } from "./DiscoveredMandatesPanel";
import { ManifestPanel } from "./ManifestPanel";
import { Inert, PreviewBanner } from "./preview-chrome";
import { PLACE } from "./mock-data";

type Altitude = "admin" | "user";

const ALTITUDE_NOTE: Record<Altitude, { title: string; body: string }> = {
  admin: {
    title: "System admin altitude",
    body:
      "Code-vs-DB truth is yours: the merged manifest with per-row sync state, the drift report, Sync, and the platform-tier defaults every org and user inherits. Writes land at the system tier.",
  },
  user: {
    title: "User hub altitude — the same place, seen as me",
    body:
      "The code-owned half collapses to what it gives you. What stays is what is genuinely yours: which holder fills each job, whether it runs on its own, and which discovered jobs you want quiet here. Writes land on your row — never the org's, never the system's.",
  },
};

export function PlacesWorkspace() {
  const [altitude, setAltitude] = useState<Altitude>("admin");
  const isUser = altitude === "user";
  const note = ALTITUDE_NOTE[altitude];

  return (
    // The admin shell already owns the scroll container and `bg-textured`;
    // this page only claims the height so short content still fills it.
    <div className="min-h-full">
      <div className="mx-auto max-w-[1600px] space-y-3 p-3 pr-14 sm:p-4 sm:pr-14">
        <PreviewBanner>
          <b>Preview — THE PLACES WORKSPACE.</b> Non-functional mockup on mock
          data, built from real house components so the structure can be judged,
          not the polish. Controls with a dashed outline are inert on purpose;
          the scope switcher, auto-run toggles, exclusion valve and both dialogs
          are live so the behaviour reads.
        </PreviewBanner>

        {/* --- place header ------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground">
                {PLACE.displayName}
              </h1>
              <Badge variant="outline" className="font-mono text-[10px]">
                {PLACE.fullName}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {PLACE.client}
              </Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <code className="font-mono">{PLACE.routePattern}</code>
              <span>·</span>
              <span>{PLACE.readinessNote}</span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <SegmentedControl
              size="sm"
              value={altitude}
              onValueChange={(v) => setAltitude(v as Altitude)}
              data={[
                { value: "admin", label: "System admin" },
                { value: "user", label: "User hub · Me" },
              ]}
            />
            <Inert what="open the live page in a new tab">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]">
                <ExternalLink className="h-3.5 w-3.5" />
                Open live page
              </Button>
            </Inert>
          </div>
        </header>

        {/* --- altitude explainer ------------------------------------- */}
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed transition-colors",
            isUser
              ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <Layers className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <b className="text-foreground">{note.title}.</b> {note.body}
          </span>
        </div>

        {/* --- 4 · the completeness strip ------------------------------ */}
        <CompletenessStrip readOnly={isUser} />

        {/* --- the three panels --------------------------------------- */}
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <ManifestPanel readOnly={isUser} />
          <div className="space-y-3">
            <BindingsPanel readOnly={isUser} />
            <DiscoveredMandatesPanel readOnly={isUser} />
          </div>
        </div>

        <footer className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <b className="text-foreground">What is new here.</b> Known-value
          alignment on every manifest row · a user-owned auto-run control with
          law 7 stated inline · a discovered-mandate preview that shows which
          keys matched · a per-place exclusion valve with restore · a
          &ldquo;would appear if…&rdquo; hint naming the one missing key. What is
          kept: the readiness badge, the severity-toned drift report, the counted
          sync receipt, the live-scope completeness read, and the hub&rsquo;s
          scope switcher.
        </footer>
      </div>
    </div>
  );
}
