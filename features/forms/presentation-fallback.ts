// features/forms/presentation-fallback.ts — TEMPORARY (lane TYPEFORM-DUP, 2026-10-07).
//
// @ai-matrx/records-ui 0.104 exports these four readers (welcomeFromDocument, endingsFromDocument,
// themeFromDocument, hiddenFromLink). Until that version is on npm and installed here, the public
// form page reads the store's presentation through these copies so the app compiles. Delete this
// file and import from "@ai-matrx/records-ui" the moment the frontend is bumped to ≥ 0.104.
type Doc = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isDoc = (raw: unknown): raw is Doc => !!raw && typeof raw === "object" && !Array.isArray(raw);

export function welcomeFromDocument(raw: unknown) {
  if (!isDoc(raw)) return null;
  const w = {
    title: text(raw["title"]),
    body: text(raw["body"]),
    pictureFileId: text(raw["picture_file_id"]),
    pictureUrl: text(raw["picture_url"]),
    buttonLabel: text(raw["button_label"]),
  };
  return w.title || w.body || w.pictureFileId || w.pictureUrl || w.buttonLabel ? w : null;
}

export function endingsFromDocument(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Doc => isDoc(e) && typeof e["id"] === "string")
    .map((d) => ({
      id: String(d["id"]),
      title: text(d["title"]),
      body: text(d["body"]),
      pictureFileId: text(d["picture_file_id"]),
      pictureUrl: text(d["picture_url"]),
      buttonLabel: text(d["button_label"]),
      redirectUrl: text(d["redirect_url"]),
      when: (d["when"] as Doc | null | undefined) ?? null,
      scoreMin: num(d["score_min"]),
      scoreMax: num(d["score_max"]),
    }));
}

export function themeFromDocument(raw: unknown) {
  if (!isDoc(raw)) return null;
  const align = raw["align"] === "center" ? "center" : raw["align"] === "left" ? "left" : null;
  return {
    accent: text(raw["accent"]),
    align,
    font: text(raw["font"]),
    button: text(raw["button"]),
    background: text(raw["background"]),
    backgroundFileId: text(raw["background_file_id"]),
    backgroundUrl: text(raw["background_url"]),
  };
}

export function hiddenFromLink(
  hiddenFields: readonly string[] | null | undefined,
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of hiddenFields ?? []) {
    const raw = params[key];
    const one = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    if (typeof one === "string" && one.trim() !== "") out[key] = one.trim().slice(0, 500);
  }
  return out;
}
