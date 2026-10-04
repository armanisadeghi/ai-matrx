/**
 * Next's App Router for the remount-safety suite: there is no router in jsdom.
 * Every navigation is recorded — a tile that navigates on mount is a repeated
 * side effect the cases can see (`navigations()`).
 */

const log: string[] = [];

export function navigations(): readonly string[] {
  return log;
}

const router = {
  push: (href: string) => void log.push(`push ${href}`),
  replace: (href: string) => void log.push(`replace ${href}`),
  back: () => void log.push("back"),
  forward: () => void log.push("forward"),
  refresh: () => undefined,
  prefetch: () => Promise.resolve(),
};

export const useRouter = () => router;
export const usePathname = () => "/board";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
export const redirect = (href: string) => {
  log.push(`redirect ${href}`);
  throw new Error(`redirect ${href}`);
};
export const notFound = () => {
  throw new Error("notFound");
};
export const forbidden = () => {
  throw new Error("forbidden");
};
export const unauthorized = () => {
  throw new Error("unauthorized");
};
export const RedirectType = { push: "push", replace: "replace" } as const;
