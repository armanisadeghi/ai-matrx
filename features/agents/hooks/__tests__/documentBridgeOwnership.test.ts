import {
  acquireDocumentBridge,
  releaseDocumentBridge,
} from "../documentBridgeOwnership";

describe("document bridge ownership", () => {
  it("gives hydration ownership only to the first concurrent mount", () => {
    expect(acquireDocumentBridge("conversation-a")).toBe(true);
    expect(acquireDocumentBridge("conversation-a")).toBe(false);

    releaseDocumentBridge("conversation-a");
    expect(acquireDocumentBridge("conversation-a")).toBe(false);

    releaseDocumentBridge("conversation-a");
    releaseDocumentBridge("conversation-a");
    expect(acquireDocumentBridge("conversation-a")).toBe(true);
    releaseDocumentBridge("conversation-a");
  });

  it("tracks conversations independently", () => {
    expect(acquireDocumentBridge("conversation-a")).toBe(true);
    expect(acquireDocumentBridge("conversation-b")).toBe(true);
    expect(acquireDocumentBridge("conversation-a")).toBe(false);

    releaseDocumentBridge("conversation-a");
    releaseDocumentBridge("conversation-a");
    releaseDocumentBridge("conversation-b");
  });
});

