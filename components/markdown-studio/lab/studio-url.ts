// components/markdown-studio/lab/studio-url.ts
//
// The studio's URL names the record on screen: ?source=<kind>&id=<uuid>, or no
// source at all when the buffer is typed, a template, or a library sample.
// Reload must reopen exactly what is shown.
//
// Two rules, each a past defect (RC-B1 verify, D2):
//  - compare against the LIVE location at call time, never a render-time
//    `searchParams` captured in an async loader's closure;
//  - write with `history.replaceState` (Next syncs `useSearchParams` from it),
//    not a router transition that a newer pick or a server round-trip can drop.

export interface StudioSourceRef {
  kind: string;
  id: string;
}

/** The search string the URL should carry for `target` (null = no source),
 *  keeping any unrelated params. */
export function studioSearchFor(
  currentSearch: string,
  target: StudioSourceRef | null,
): string {
  const params = new URLSearchParams(currentSearch);
  if (target) {
    params.set("source", target.kind);
    params.set("id", target.id);
  } else {
    params.delete("source");
    params.delete("id");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function syncStudioSourceUrl(target: StudioSourceRef | null): void {
  if (typeof window === "undefined") return;
  const next = studioSearchFor(window.location.search, target);
  if (next === window.location.search) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${next}${window.location.hash}`,
  );
}
