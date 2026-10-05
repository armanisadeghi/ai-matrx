import type { Resource } from "../../../../resources/types";

jest.mock("../../../../../host/notify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("../../../../../store/hooks", () => ({
  useAppDispatch: jest.fn(),
  useAppStore: jest.fn(),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.

jest.mock("../../../../redux/execution-system/instance-resources/instance-resources.slice", () => ({
  addResource: jest.fn(),
  setResourcePreview: jest.fn(),
}));
jest.mock("../../../../redux/execution-system/conversations/conversations.selectors", () => ({
  selectIsCacheOnly: jest.fn(),
}));
jest.mock("../../../../redux/execution-system/instance-resources/resource-source", () => ({
  refineBlockType: jest.fn(),
  resourceDataToSource: jest.fn(),
}));
jest.mock("../../../../redux/execution-system/instance-resources/editable-resource-types", () => ({
  isEditableCapableBlockType: jest.fn(() => false),
}));
// W5 swap: durable edges ride the @ai-matrx/associations host store.
jest.mock("../../../../../context/sources/scopes", () => ({
  ...jest.requireActual("../../../../../context/sources/scopes"),
  ...(() => ({
  getAssociationsStore: jest.fn(),
}))(),
}));
jest.mock("../attached-documents", () => ({
  cleanDocumentLabel: jest.fn(),
  documentAttachLabelFromState: jest.fn(),
}));

import { resourceLabel, resourceTypeToBlockType } from "../attach-resource";

describe("Voice Pad text resource mapping", () => {
  const voicePadResource = {
    type: "text",
    data: {
      id: "voice-pad-172341",
      label: "Voice Pad transcript",
      text: "A dictated thought that should become normal user text.",
    },
  } satisfies Resource;

  it("maps text to the canonical text message-part family", () => {
    expect(resourceTypeToBlockType(voicePadResource.type)).toBe("text");
  });

  it("preserves the user-facing Voice Pad label", () => {
    expect(resourceLabel(voicePadResource)).toBe("Voice Pad transcript");
  });
});
