import type { Resource } from "@/features/agents/resources/types";

jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: jest.fn(),
  useAppStore: jest.fn(),
}));
jest.mock("@/features/agents/redux/execution-system/instance-resources/instance-resources.slice", () => ({
  addResource: jest.fn(),
  setResourcePreview: jest.fn(),
}));
jest.mock("@/features/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectIsCacheOnly: jest.fn(),
}));
jest.mock("@/features/agents/redux/execution-system/instance-resources/resource-source", () => ({
  refineBlockType: jest.fn(),
  resourceDataToSource: jest.fn(),
}));
jest.mock("@/features/agents/redux/execution-system/instance-resources/editable-resource-types", () => ({
  isEditableCapableBlockType: jest.fn(() => false),
}));
jest.mock("@/features/scopes/redux/thunks/associations", () => ({
  addAssociation: jest.fn(),
  loadAssociations: jest.fn(),
}));
jest.mock("@/features/agents/components/inputs/resources/attached-documents", () => ({
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
