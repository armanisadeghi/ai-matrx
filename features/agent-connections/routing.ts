import { SIDEBAR_SECTIONS } from "./constants";
import type { AgentConnectionsSection } from "./types";

export const AGENT_CONNECTIONS_BASE = "/agent-connections";

/** Build the URL for a given section. The "overview" section is the root path;
 *  every other section lives at `${base}/${urlSegment ?? value}`. */
export function sectionToHref(
  basePath: string,
  section: AgentConnectionsSection,
): string {
  if (section === "overview") return basePath;
  const entry = SIDEBAR_SECTIONS.find((s) => s.value === section);
  const slug = entry?.urlSegment ?? section;
  return `${basePath}/${slug}`;
}

/** Reverse of `sectionToHref`: given a URL path-segment, return the matching
 *  section value. Returns "overview" for an undefined or unknown segment so
 *  the sidebar always has something to highlight. */
export function segmentToSection(
  segment: string | undefined,
): AgentConnectionsSection {
  if (!segment) return "overview";
  const entry = SIDEBAR_SECTIONS.find(
    (s) => (s.urlSegment ?? s.value) === segment,
  );
  return entry?.value ?? "overview";
}
