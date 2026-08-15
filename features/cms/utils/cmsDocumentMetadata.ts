import type { ClientPageSummary, ClientSite } from "@/features/cms/types";

export function cmsDocumentTitle(
  site: Pick<ClientSite, "id" | "name">,
  pages: readonly Pick<ClientPageSummary, "id" | "title">[],
  pathname: string,
): string {
  const pageMatch = pathname.match(/\/pages\/([^/?#]+)/);
  if (pageMatch) {
    const pageLabel =
      pageMatch[1] === "new"
        ? "New page"
        : (pages.find((page) => page.id === pageMatch[1])?.title ?? "Page");
    return `${pageLabel} | ${site.name} — AI Matrx`;
  }

  const section = pathname.endsWith("/components")
    ? "Components"
    : pathname.includes("/collections")
      ? "Collections"
      : pathname.endsWith("/settings")
        ? "Settings"
        : null;
  return section
    ? `${section} | ${site.name} — AI Matrx`
    : `${site.name} — AI Matrx`;
}
