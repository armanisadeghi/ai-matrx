/**
 * Every send in /messages and the /work Live hub logged
 * `[associations] invalid_argument … sourceIds[0] must be a UUID (got "optimistic:mx-…")`:
 * the bubble chrome asked for the links of the composer's optimistic twin. An unsaved row
 * (sending / failed) must never ask; a saved one still does.
 */
import { expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asked: string[] = [];
jest.mock("../MessageLinks", () => ({
  MessageLinks: ({ messageId }: { messageId: string }) => {
    asked.push(messageId);
    return null;
  },
}));

import { MessagingMessageChrome } from "../MessagingChrome";
import type { MessageWrapperProps } from "@ai-matrx/messaging/react";

function msg(id: string, deliveryState: string): MessageWrapperProps["message"] {
  return { id, deliveryState, senderId: "u-1", metadata: {} } as unknown as MessageWrapperProps["message"];
}

it("asks for links only for saved messages", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const Chrome = MessagingMessageChrome as unknown as React.ComponentType<{ message: MessageWrapperProps["message"]; children: React.ReactNode }>;
  await act(async () => {
    root.render(
      <>
        <Chrome message={msg("optimistic:mx-1", "sending")}>a</Chrome>
        <Chrome message={msg("optimistic:mx-2", "failed")}>b</Chrome>
        <Chrome message={msg("6c1e0b0a-0000-4000-8000-000000000001", "sent")}>c</Chrome>
      </>,
    );
  });
  expect(asked).toEqual(["6c1e0b0a-0000-4000-8000-000000000001"]);
});
