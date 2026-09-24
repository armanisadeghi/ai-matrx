/**
 * THE READER'S THREE ANSWERS — bound, unbound, and "this platform cannot hold
 * a binding yet", which is NOT the same as unbound.
 *
 * `web.brand.integrations` is applied by the chair (campaign ruling A11), so
 * between this lane and that moment every read of it comes back `42703 column
 * … does not exist`. Collapsing that into `unbound` would put a bind control in
 * front of a person that writes into a column which is not there, and would
 * tell a brand that HAS a channel that it does not.
 */

const state = {
  error: null as { code: string; message: string } | null,
  row: null as Record<string, unknown> | null,
};

jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    is: self,
    abortSignal: self,
    maybeSingle: async () => ({ data: state.row, error: state.error }),
  });
  return {
    supabase: { schema: () => ({ from: () => chain }) },
  };
});

import {
  BINDING_COLUMN_ABSENT_SENTENCE,
  readBrandChannelBinding,
} from "../binding";

const BRAND_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const CONNECTION_ID = "11111111-2222-4333-8444-555555555555";
const CHANNEL_ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw";

function boundDocument() {
  return {
    marketing: {
      schema_version: 1,
      providers: {
        youtube_channel: {
          enabled: true,
          credential_authority: "external_connection",
          credential_ref: CONNECTION_ID,
          resource_ref: CHANNEL_ID,
        },
      },
    },
  };
}

beforeEach(() => {
  state.error = null;
  state.row = null;
});

const BRAND_ORG_ID = "4c425bfe-9a08-402f-9496-488580623f42";

describe("the column is not applied yet", () => {
  it("is its own state, with the remedy — never `unbound`", async () => {
    state.error = { code: "42703", message: "column brand.integrations does not exist" };
    const binding = await readBrandChannelBinding(BRAND_ID);
    expect(binding.state).toBe("column_absent");
    if (binding.state !== "column_absent") throw new Error("unreachable");
    expect(binding.sentence).toBe(BINDING_COLUMN_ABSENT_SENTENCE);
    expect(binding.sentence).toContain("brand_integrations_youtube_channel.sql");
  });

  it("still throws on any OTHER database error — a real fault is not a stand-in", async () => {
    state.error = { code: "42501", message: "permission denied for table brand" };
    await expect(readBrandChannelBinding(BRAND_ID)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("the column is applied", () => {
  it("reads a bound channel as the two facts the refresh needs", async () => {
    state.row = { id: BRAND_ID, version: 4, organization_id: BRAND_ORG_ID, integrations: boundDocument() };
    const binding = await readBrandChannelBinding(BRAND_ID);
    expect(binding).toEqual({
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 4,
      // The brand's OWN organization — where its channel data is read.
      organizationId: BRAND_ORG_ID,
    });
  });

  it("reads an empty document as unbound, carrying the version a bind will guard on", async () => {
    state.row = { id: BRAND_ID, version: 4, organization_id: BRAND_ORG_ID, integrations: {} };
    expect(await readBrandChannelBinding(BRAND_ID)).toEqual({
      state: "unbound",
      brandVersion: 4,
    });
  });

  it("reads a DISABLED binding as unbound — a switched-off row is not a channel", async () => {
    const document = boundDocument();
    document.marketing.providers.youtube_channel.enabled = false;
    state.row = { id: BRAND_ID, version: 9, organization_id: BRAND_ORG_ID, integrations: document };
    expect(await readBrandChannelBinding(BRAND_ID)).toEqual({
      state: "unbound",
      brandVersion: 9,
    });
  });

  it("reads a half-written binding as unbound rather than refreshing with a blank id", async () => {
    const document = boundDocument();
    document.marketing.providers.youtube_channel.resource_ref = "";
    state.row = { id: BRAND_ID, version: 2, organization_id: BRAND_ORG_ID, integrations: document };
    expect(await readBrandChannelBinding(BRAND_ID)).toEqual({
      state: "unbound",
      brandVersion: 2,
    });
  });
});
