/**
 * @ai-matrx/rich-content's host for Jest — the same capabilities as providers/richContentHost.ts,
 * but every one resolves the app module AT CALL TIME (`require` inside the getter), so a suite's
 * `jest.mock("@/lib/toast")` (or any other mocked app module) still reaches the engine code that
 * moved into the package, exactly as when that code imported the app module itself.
 */
import { configureRichContent } from "@ai-matrx/rich-content/host";
import { registerKindCorrector } from "@ai-matrx/rich-content/kinds/registry/kind-correctors";

/* eslint-disable @typescript-eslint/no-require-imports */
function late<T extends object>(load: () => T): T {
  return new Proxy(function () {} as unknown as T, {
    get(_t, key) {
      const target = load() as Record<PropertyKey, unknown>;
      const value = target[key];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
    apply(_t, _this, args) {
      return (load() as unknown as (...a: unknown[]) => unknown)(...args);
    },
  });
}

configureRichContent({
  // The app bindings load on first use (they import the app's windows, canvas, kind views and
  // domain blocks — too much to load into every suite); loading them re-registers `app` itself.
  app: new Proxy({}, {
    get(_t, key) {
      require("@/features/rich-content-host/app-bindings");
      return (require("@ai-matrx/rich-content/host").hostCapability("app") as Record<PropertyKey, unknown> | undefined)?.[key];
    },
  }) as never,
  toast: late(() => require("@/lib/toast").toast),
  captureError: (report) => require("@/lib/diagnostics/errorCaptureStore").captureError(report),
  ErrorActions: (props) => require("@/components/errors/ErrorAlchemyMenu").ErrorAlchemyMenu(props),
  NestedContent: (props) => require("react").createElement(require("@ai-matrx/rich-content/levels/standard/NestedRichContent").NestedRichContent, props),
  wikilinks: {
    resolve: (t) => require("@/features/rich-content-host/wikilink-resolver").resolveWikiTarget(t),
    create: (title) => require("@/features/rich-content-host/wikilink-resolver").createWikiPage(title),
    loadBody: (token, id) => require("@/features/rich-content-host/wikilink-resolver").loadWikiBody(token, id),
  },
  resolvePerson: async (id) => require("@/features/organizations/people/visiblePeople").resolveVisiblePerson(id),
  ResourcePeek: (props) => require("react").createElement(require("@/features/organizations/peek/ResourcePeekHost").ResourcePeekHost, props),
  splitterEnvelopes: {
    withIrEnvelope: (source, metadata) => require("@ai-matrx/rich-content/kinds/registry/region-envelope-memo").withIrEnvelope(source, metadata),
    fenceRegion: (l, t) => require("@/features/content-ir/surfaces/xml-finalize").envelopeForCompletedFenceRegion(l, t),
    xmlRegion: (tag, t) => require("@/features/content-ir/surfaces/xml-finalize").envelopeForCompletedXmlRegion(tag, t),
  },
  useOpenSaveToTable: () => require("@/features/overlays/openers/saveToTable").useOpenSaveToTable(),
  kindRegistry: late(() => require("@/features/content-ir/registry/kind-registry").kindRegistry),
  componentRegistry: late(() => require("@/features/content-ir/registry/component-registry").componentRegistry),
  contentIrHost: late(() => require("@/features/content-ir/host/ContentIrHostBoundary").matrxContentIrHost),
  reportKindComponentIncident: (incident) => require("@/features/content-ir/react/db-component/kindComponentIncident").reportKindComponentIncident(incident),
});

registerKindCorrector("draft_critique", (value) => {
  const result = require("@/features/crm/draft-critique/draftCritique").correctDraftCritique(value);
  return { value: result.critique, corrections: result.corrections };
});
