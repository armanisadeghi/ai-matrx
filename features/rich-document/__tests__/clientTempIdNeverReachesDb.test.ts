/**
 * A chat answer committed under a client-temp id (`client-assistant-req_…`,
 * minted by process-stream when no `cx_message` reservation arrived — every
 * incognito turn, and a backend reservation gap) has NO database row. The two
 * seams that turn a rendered message into a database identity must answer
 * "no record yet" for it, so thumbs, comments, highlights and links stay
 * absent instead of firing reads that 400 with `22P02 invalid input syntax for
 * type uuid` (observed 2026-10-01, PB-03 incognito step on the clone).
 *
 * Break this catches: either mapper returning `source.messageId` unchecked.
 * The ids below are the exact shapes process-stream mints.
 */

import { outputFeedbackSubjectForSource } from "../outputFeedbackSubject";
import { annotationRecordOf } from "../annotations/record-of-source";

const CONVERSATION_ID = "1d89469c-0998-4bb4-b90a-446672519815";

describe("a client-temp chat message never becomes a database identity", () => {
  it.each([
    "client-assistant-req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1",
    "client-assistant-req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f-iter2",
    "client-tool-call-toolu_01H8ZQ",
  ])("output feedback has no subject for %s", (messageId) => {
    expect(
      outputFeedbackSubjectForSource({
        type: "chat-message",
        conversationId: CONVERSATION_ID,
        messageId,
      }),
    ).toBeNull();
  });

  it.each([
    "client-assistant-req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1",
    "client-assistant-req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f-iter2",
  ])("annotations have no record for %s", (messageId) => {
    expect(
      annotationRecordOf({
        type: "chat-message",
        conversationId: CONVERSATION_ID,
        messageId,
      }),
    ).toBeNull();
  });
});

describe("a durable chat message keeps its database identity", () => {
  it.each([
    "263550e7-eb60-4e8e-97ee-e19297126ebe",
    "993b734d-bd03-45bb-9bdd-0458025c89fb",
  ])("output feedback subject is message %s", (messageId) => {
    expect(
      outputFeedbackSubjectForSource({
        type: "chat-message",
        conversationId: CONVERSATION_ID,
        messageId,
      }),
    ).toEqual({ subjectType: "message", subjectId: messageId });
  });

  it.each([
    "263550e7-eb60-4e8e-97ee-e19297126ebe",
    "993b734d-bd03-45bb-9bdd-0458025c89fb",
  ])("annotation record is message %s", (messageId) => {
    expect(
      annotationRecordOf({
        type: "chat-message",
        conversationId: CONVERSATION_ID,
        messageId,
      }),
    ).toMatchObject({ token: "message", id: messageId });
  });
});
