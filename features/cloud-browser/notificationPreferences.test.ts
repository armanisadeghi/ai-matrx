/**
 * D-14 notification preferences live on the CANONICAL tables.
 *
 * These lock the defect closed: the four switches used to be written to
 * `browser.profile.metadata` JSONB — a parallel preference store per BROWSER,
 * invisible to every sender and to every other notification surface.
 */

import {
  loadHandoffChannelPreferences,
  setHandoffEmailPreference,
  setHandoffSmsPreference,
} from "./notificationPreferences";

const state: {
  userId: string | null;
  email: Record<string, unknown> | null;
  sms: Record<string, unknown> | null;
  writes: { table: string; values: Record<string, unknown> }[];
} = { userId: "u_1", email: null, sms: null, writes: [] };

function table(name: string) {
  const row = name === "user_email_preferences" ? state.email : state.sms;
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    is: self,
    maybeSingle: async () => ({ data: row, error: null }),
    update: (values: Record<string, unknown>) => {
      state.writes.push({ table: name, values });
      return { eq: async () => ({ error: null }) };
    },
    insert: async (values: Record<string, unknown>) => {
      state.writes.push({ table: name, values });
      return { error: null };
    },
  });
  return chain;
}

jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async () => "org_personal",
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: state.userId ? { id: state.userId } : null },
      }),
    },
    schema: () => ({ from: (name: string) => table(name) }),
  },
}));

beforeEach(() => {
  state.userId = "u_1";
  state.email = null;
  state.sms = null;
  state.writes = [];
});

describe("reading consent", () => {
  it("reads both channels from their canonical tables", async () => {
    state.email = { browser_handoff_notifications: true };
    state.sms = { sms_enabled: true, system_alerts: true };

    await expect(loadHandoffChannelPreferences()).resolves.toEqual({
      email: true,
      sms: true,
      smsEnrolled: true,
    });
  });

  it("treats a missing row as never-opted-in, not as opted-out forever", async () => {
    await expect(loadHandoffChannelPreferences()).resolves.toEqual({
      email: false,
      sms: false,
      smsEnrolled: false,
    });
  });

  it("refuses to call an un-enrolled number a channel", async () => {
    state.sms = { sms_enabled: false, system_alerts: true };

    const prefs = await loadHandoffChannelPreferences();

    expect(prefs.sms).toBe(false);
    expect(prefs.smsEnrolled).toBe(false);
  });
});

describe("writing consent", () => {
  it("updates the existing email preference row", async () => {
    state.email = { id: "pref_1" };

    await setHandoffEmailPreference(true);

    expect(state.writes).toEqual([
      {
        table: "user_email_preferences",
        values: { browser_handoff_notifications: true },
      },
    ]);
  });

  it("creates the email preference row when the person has never had one", async () => {
    await setHandoffEmailPreference(true);

    expect(state.writes[0].table).toBe("user_email_preferences");
    expect(state.writes[0].values).toMatchObject({
      user_id: "u_1",
      // Never a null org on an org-scoped row.
      organization_id: "org_personal",
      browser_handoff_notifications: true,
    });
  });

  it("flips only the system_alerts family on an enrolled SMS row", async () => {
    state.sms = { id: "sms_1", sms_enabled: true };

    await setHandoffSmsPreference(true);

    expect(state.writes).toEqual([
      { table: "sms_notification_preferences", values: { system_alerts: true } },
    ]);
  });

  it("never mints SMS consent for an un-enrolled number", async () => {
    state.sms = { id: "sms_1", sms_enabled: false };

    await expect(setHandoffSmsPreference(true)).rejects.toThrow(
      /Verify a mobile number/,
    );
    expect(state.writes).toEqual([]);
  });

  it("refuses to write anything for a signed-out caller", async () => {
    state.userId = null;

    await expect(setHandoffEmailPreference(true)).rejects.toThrow(/Sign in/);
    expect(state.writes).toEqual([]);
  });
});
