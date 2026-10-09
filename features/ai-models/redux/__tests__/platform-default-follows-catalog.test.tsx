/** @jest-environment jsdom */

/**
 * The platform-default model (the name on "Platform default (…)", the model the
 * default-chat field shows) is read from the model catalog's records, which are
 * not Redux state. A screen reading it must update the moment the catalog loads,
 * with no other state change — through the REAL records store.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { createModelRecords, type ModelRecords } from "@ai-matrx/agents/models";
import {
  resolvePlatformDefaultModel,
  selectPlatformDefaultTextModelName,
} from "../platformDefaultModel";

let records: ModelRecords;
jest.mock("@ai-matrx/chat/agents/identity/model-catalog", () => ({
  readModelRecords: () => records.getState(),
  getModelRecords: () => records,
  useModelRecords: (select: (s: ReturnType<ModelRecords["getState"]>) => unknown) =>
    useSyncExternalStore(
      (cb) => records.subscribe(cb),
      () => select(records.getState()),
    ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";

const primary = {
  id: "sonnet",
  name: "claude-sonnet-5",
  common_name: "Claude Sonnet 5",
  is_primary: true,
  is_deprecated: false,
  capabilities: { input: ["text"], output: ["text"] },
};

function Probe() {
  const name = useModelRecords(selectPlatformDefaultTextModelName);
  return <span>{name ?? "none"}</span>;
}

beforeEach(() => {
  records = createModelRecords({ client: {} as never });
});

it("the platform-default name appears when the catalog loads, with no other change", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  expect(host.textContent).toBe("none");
  act(() =>
    records.hydrate({
      models: [primary as never],
      fetchType: "options",
      fetchScope: "active",
      lastFetched: Date.now(),
    }),
  );
  expect(resolvePlatformDefaultModel(Object.values(records.getState().entities) as never, "text", true)?.id).toBe("sonnet");
  expect(host.textContent).toBe("Claude Sonnet 5");
  act(() => root.unmount());
});
