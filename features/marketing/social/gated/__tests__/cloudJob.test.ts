import { cloudView, parseReadiness } from "../cloudJob";

const row = (cloud: unknown) => ({ metadata: { social: { path: "cloud_browser", cloud } } });

describe("cloudView", () => {
  it("is null when the cloud browser never touched the job", () => {
    expect(cloudView({ metadata: {} })).toBeNull();
    expect(cloudView(row({ stage: "teleporting" }))).toBeNull();
  });

  it("maps an active stage to its label and keeps it non-terminal", () => {
    expect(cloudView(row({ stage: "signing_in" }))).toEqual({
      stage: "signing_in",
      label: "Signing in",
      note: null,
      terminal: false,
      failed: false,
    });
  });

  it("waiting for the person carries the server's sentence", () => {
    const v = cloudView(row({ stage: "waiting_for_you", note: "LinkedIn wants a code." }));
    expect(v?.label).toBe("Waiting for you");
    expect(v?.note).toBe("LinkedIn wants a code.");
    expect(v?.terminal).toBe(false);
  });

  it("needs_login and failed end the run and read as failures", () => {
    expect(cloudView(row({ stage: "needs_login" }))?.failed).toBe(true);
    expect(cloudView(row({ stage: "failed" }))?.terminal).toBe(true);
    expect(cloudView(row({ stage: "done" }))?.failed).toBe(false);
  });
});

describe("parseReadiness", () => {
  it("keeps only logins with an id and never needs a value", () => {
    const r = parseReadiness({
      supported: true,
      enabled: true,
      platform: "linkedin",
      platform_name: "LinkedIn",
      logins: [{ item_id: "a1", display_name: "Work LinkedIn" }, { display_name: "broken" }, null],
    });
    expect(r).toEqual({
      supported: true,
      enabled: true,
      platformName: "LinkedIn",
      logins: [{ itemId: "a1", name: "Work LinkedIn" }],
    });
  });
});
