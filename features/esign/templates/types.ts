// features/esign/templates/types.ts — the sender's template list row (CONTRACT §6.1).
export type { TemplateRow } from "../editor/api/types";

export function templateEditHref(id: string): string {
  return `/esign/templates/${id}`;
}
export function templateUseHref(id: string): string {
  return `/esign/new?template=${id}`;
}
