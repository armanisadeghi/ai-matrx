// Self-test for matrx/no-navigation-for-query-state (lane URL-STATE, 2026-09-24).
//   node --test scripts/lint-rules/no-navigation-for-query-state.selftest.mjs
// Every `invalid` case is a shape that lived in the tree before the lane moved it (file named);
// every `valid` case is a shape that must stay legal (a real route change, the door itself).
import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { noNavigationForQueryState as rule } from "./no-navigation-for-query-state.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
  },
});

const inFeatures = "/repo/features/example/Example.tsx";
const inApp = "/repo/app/(core)/data-v2/[tableId]/page.tsx";
const inLib = "/repo/lib/example/example.ts";
const inHooks = "/repo/hooks/example/useExample.ts";
const inComponents = "/repo/components/example/Example.tsx";
const inProviders = "/repo/providers/example/ExampleProvider.tsx";
const raw = [{ messageId: "rawHistory" }];
const query = [{ messageId: "queryOnlyRouter" }];

tester.run("no-navigation-for-query-state", rule, {
  valid: [
    // a real route change
    { filename: inFeatures, code: "router.replace(`/libraries/${libraryId}`);" },
    { filename: inFeatures, code: "router.push(`${basePath}/${agentId}/shortcuts/${id}`);" },
    { filename: inFeatures, code: "router.replace(`${pathname}/edit`);" },
    { filename: inFeatures, code: 'router.replace("/data");' },
    // router.push is census-only unless the option is on
    { filename: inFeatures, code: "router.push(`${pathname}?${qs}`);" },
    // the door itself, tests, and code outside features/app/lib/hooks/components/providers
    { filename: "/repo/lib/url-state/addressWithoutNavigating.ts", code: 'window.history.replaceState(null, "", next);' },
    { filename: "/repo/features/x/__tests__/a.test.tsx", code: 'window.history.replaceState(null, "", "/a");' },
    { filename: "/repo/scripts/x/Y.ts", code: 'window.history.replaceState(null, "", "/a");' },
    // not history / not a router
    { filename: inFeatures, code: "table.replaceState(appendState);" },
    { filename: inFeatures, code: 'text.replace("?", "");' },
  ],
  invalid: [
    // app/(core)/data-v2/[tableId]/page.tsx onViewChanged
    { filename: inApp, code: "router.replace(`${pathname}?${next.toString()}`, { scroll: false });", errors: query },
    // features/unified-data/hub/OrganizationHub.tsx
    { filename: inFeatures, code: "router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });", errors: query },
    // app/(admin)/administration/users/feedback/components/FeedbackTable.tsx
    { filename: inApp, code: 'router.replace(`${pathname}${next.size ? `?${next}` : ""}`);', errors: query },
    // features/admin/limits/components/FeatureKnobsPanel.tsx
    { filename: inFeatures, code: 'router.replace(suffix ? `?${suffix}` : "?", { scroll: false });', errors: query },
    // features/workflow-runtime/bakeoff/dense-2/DenseRunConsole.tsx
    { filename: inFeatures, code: "router.replace(pathname);", errors: query },
    // features/marketing/data/query-state.ts (a local const)
    { filename: inFeatures, code: "const href = query ? `${pathname}?${query}` : pathname;\nrouter.replace(href, { scroll: false });", errors: query },
    // concatenation and a URL object
    { filename: inLib, code: 'router.replace(url.pathname + "?" + url.searchParams);', errors: query },
    // push, with the census option
    { filename: inFeatures, code: "router.push(`${pathname}?${qs}`);", options: [{ push: true }], errors: query },
    // features/cx-chat/components/core/ChatConversationClient.tsx
    { filename: inFeatures, code: 'window.history.replaceState(window.history.state, "", newUrl);', errors: raw },
    // features/files/utils/url-state.ts
    { filename: inFeatures, code: 'window.history.pushState(window.history.state, "", url);', errors: raw },
    // features/ai-models/hooks/useTabUrlState.ts (null state, still outside the door)
    { filename: inFeatures, code: 'window.history.replaceState(null, "", href);', errors: raw },
    // app/(dev)/demos/tests/slack/page.dev.tsx
    { filename: inApp, code: "history.replaceState({}, document.title, window.location.pathname);", errors: raw },
    // hooks/useAnchoredSections.ts, components/ and providers/ — scope widened
    // to hooks/, components/, providers/ (lane URL-STATE, 2026-09-25)
    { filename: inHooks, code: 'window.history.replaceState(window.history.state, "", url);', errors: raw },
    { filename: inComponents, code: "router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });", errors: query },
    { filename: inProviders, code: 'window.history.replaceState(window.history.state, "", url);', errors: raw },
  ],
});
