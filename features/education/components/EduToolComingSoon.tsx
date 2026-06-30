// Server component. Thin wrapper that renders the EduComingSoon placeholder for
// a tool slug from the tools registry. Keeps each /education/<tool> route file
// to a couple of lines while the single source of config stays in data/tools.ts.
//
// `surface` is for the tool's SUB-ROUTE placeholders (new / [id] / [id]/edit /
// use-modes). It re-titles the stub and prints the route's permission gate so
// the agent who builds it knows exactly what goes there. See ROUTING.md for the
// canonical view/edit/use flow + the gating model.
import { notFound } from "next/navigation";
import { EduComingSoon } from "./EduComingSoon";
import { EDU_TOOL_BY_SLUG } from "../data/tools";

/** view = share/visibility-gated (a sharee can see + use it); edit = gated to
 *  edit permission; auth = your own library, sign-in only. */
type SurfaceGate = "auth" | "view" | "edit";

const GATE_NOTE: Record<SurfaceGate, string> = {
  auth: "Your library — requires sign-in.",
  view: "Open to anyone with view access (respects the item's visibility / share grant).",
  edit: "Edit surface — gated to EDIT permission (owner or editor-shared). View-only sharees are redirected to the view route.",
};

interface EduToolComingSoonProps {
  slug: string;
  /** Present on sub-route placeholders; absent on the tool's home/library page. */
  surface?: { label: string; gate: SurfaceGate };
}

export function EduToolComingSoon({ slug, surface }: EduToolComingSoonProps) {
  const tool = EDU_TOOL_BY_SLUG[slug];
  if (!tool) notFound();
  return (
    <EduComingSoon
      icon={tool.icon}
      title={surface ? `${tool.name} · ${surface.label}` : tool.name}
      description={tool.description}
      // Full builder checklist only on the tool home; sub-routes show the gate note.
      capabilities={surface ? undefined : tool.capabilities}
      surfaceNote={surface ? GATE_NOTE[surface.gate] : undefined}
      visionRef={tool.visionRef}
      status={tool.status}
      accessTier={tool.accessTier}
    />
  );
}
