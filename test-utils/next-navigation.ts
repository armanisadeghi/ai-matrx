/**
 * test-utils/next-navigation.ts
 *
 * THE ONE `next/navigation` double for jest suites.
 *
 * The App Router is a genuine external dependency: outside a Next request
 * there is no router context, so `useRouter()` throws its "expected app router
 * to be mounted" invariant and `useSearchParams()` answers `null`. Replacing
 * it is legitimate (forcing-function-tests §4 — it is a dependency the SUT
 * CALLS, never logic the SUT owns).
 *
 * What is NOT legitimate is the per-suite partial mock this file exists to
 * replace. Three suites hand-wrote `{ useRouter, usePathname }` style objects
 * listing only the hooks their component happened to call on the day they were
 * written; on 2026-09-18 all three went red at once — `RulePassageLink` adopted
 * `useParams`, `SettingTable` adopted `useSearchParams`, `AlchemyHost` adopted
 * `useRouter` — and each failure read as a crash inside an assertion about
 * something else entirely. A double that answers the WHOLE module surface
 * cannot produce that class of false red.
 *
 * Every value a scenario depends on is passed in, so a test still fails when
 * the component reads the wrong one. Nothing here decides anything the
 * component under test owns.
 *
 * Usage (the factory must be required INSIDE the hoisted `jest.mock` body):
 *
 *   jest.mock("next/navigation", () =>
 *     require("@/test-utils/next-navigation").nextNavigationMock({
 *       params: { id: "rb-1" },
 *       pathname: "/masterwork/rb-1",
 *     }),
 *   );
 */

export interface NextNavigationScenario {
  /** Dynamic route segments this scenario is rendered under. */
  params?: Record<string, string | string[]>;
  /** Query string the scenario carries — `"a=1&b=2"` or a plain object. */
  searchParams?: string | Record<string, string>;
  /** The path the scenario is rendered at. */
  pathname?: string;
  /** Router methods a test wants to observe. Unlisted ones are inert spies. */
  router?: Partial<Record<RouterMethod, jest.Mock>>;
}

type RouterMethod =
  | "push"
  | "replace"
  | "refresh"
  | "back"
  | "forward"
  | "prefetch";

const ROUTER_METHODS: readonly RouterMethod[] = [
  "push",
  "replace",
  "refresh",
  "back",
  "forward",
  "prefetch",
];

export function nextNavigationMock(scenario: NextNavigationScenario = {}) {
  const params = scenario.params ?? {};
  const pathname = scenario.pathname ?? "/";
  const searchParams = new URLSearchParams(scenario.searchParams ?? "");
  const router = Object.fromEntries(
    ROUTER_METHODS.map((method) => [
      method,
      scenario.router?.[method] ?? jest.fn(),
    ]),
  ) as Record<RouterMethod, jest.Mock>;

  return {
    useRouter: () => router,
    useParams: () => params,
    useSearchParams: () => searchParams,
    usePathname: () => pathname,
    useSelectedLayoutSegment: () => null,
    useSelectedLayoutSegments: () => [],
    redirect: jest.fn((destination: string) => {
      throw new Error(`redirect:${destination}`);
    }),
    permanentRedirect: jest.fn((destination: string) => {
      throw new Error(`permanentRedirect:${destination}`);
    }),
    notFound: jest.fn(() => {
      throw new Error("notFound");
    }),
    forbidden: jest.fn(() => {
      throw new Error("forbidden");
    }),
    unauthorized: jest.fn(() => {
      throw new Error("unauthorized");
    }),
    ReadonlyURLSearchParams: URLSearchParams,
  };
}
