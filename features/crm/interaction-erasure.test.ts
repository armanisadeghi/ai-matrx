import { webcrypto } from "node:crypto";

import {
  buildInteractionRemoval,
  erasureTombstoneMessageId,
} from "./interaction-erasure";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});

describe("retained Gmail reply erasure", () => {
  it("replaces Gmail content and provider identifiers with one irreversible tombstone", async () => {
    const removal = await buildInteractionRemoval(
      {
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "22222222-2222-4222-8222-222222222222",
        direction: "inbound",
        channel_code: "email",
        message_id: "gmail-provider-message-id",
        attributes: {
          outreach_inbound: {
            identity_id: "33333333-3333-4333-8333-333333333333",
            rfc822_message_id: "<reply@mail.gmail.com>",
            rfc822_references: "<original@mail.gmail.com>",
            evidence: "Please contact me next Tuesday",
          },
        },
      },
      "2026-09-22T12:00:00.000Z",
    );

    expect(removal.providerMessageId).toBe("gmail-provider-message-id");
    expect(removal.sendingIdentityId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(removal.patch).toEqual({
      deleted_at: "2026-09-22T12:00:00.000Z",
      subject: null,
      body: null,
      thread_key: null,
      in_reply_to: null,
      message_id:
        "erased:sha256:04af5b628c5975fc708c0ffd48f8419518f421111fda47872a82493389cd911f",
      attributes: {},
      metadata: {},
      custom_fields: {},
      provider: null,
      provider_account_id: null,
      provider_interaction_id: null,
      provider_status: null,
      provider_status_at: null,
      provider_status_sequence: null,
    });
    expect(JSON.stringify(removal.patch)).not.toContain(
      "gmail-provider-message-id",
    );
    expect(JSON.stringify(removal.patch)).not.toContain("reply@mail.gmail.com");
    expect(JSON.stringify(removal.patch)).not.toContain("Please contact me");
  });

  it("keeps ordinary CRM interaction deletion as a soft delete", async () => {
    const removal = await buildInteractionRemoval(
      {
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "22222222-2222-4222-8222-222222222222",
        direction: "outbound",
        channel_code: "call",
        message_id: null,
        attributes: {},
      },
      "2026-09-22T12:00:00.000Z",
    );

    expect(removal).toEqual({
      providerMessageId: null,
      sendingIdentityId: null,
      patch: { deleted_at: "2026-09-22T12:00:00.000Z" },
    });
  });

  it("uses the same tombstone value as the server", async () => {
    await expect(erasureTombstoneMessageId("gmail-erased-ooo")).resolves.toBe(
      "erased:sha256:f0ea9384b105c2d7762731b0d93ecda0e495919284cfbf4e513e6310de7ab795",
    );
  });
});
