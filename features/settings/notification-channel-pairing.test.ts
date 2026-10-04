import { pairedChannels, pairedWrites } from "./notification-channel-pairing";

const base = { defaultEmail: true, defaultDm: false, ownEmail: undefined, ownDm: undefined, pairs: true };

describe("the pairing rule on the settings screen (same answer as the server)", () => {
  test("an email notice comes with its message", () => {
    expect(pairedChannels(base)).toEqual({ email: true, dm: true, emailNeedsMessage: false });
  });

  test("turning only the email off keeps the message", () => {
    expect(pairedChannels({ ...base, ownEmail: false })).toEqual({
      email: false,
      dm: true,
      emailNeedsMessage: false,
    });
  });

  test("turning the message off turns the email off too, and says so", () => {
    expect(pairedChannels({ ...base, ownDm: false })).toEqual({
      email: false,
      dm: false,
      emailNeedsMessage: true,
    });
  });

  test("an unpaired notice (a one-time code) keeps its email with the message off", () => {
    expect(pairedChannels({ ...base, pairs: false, ownDm: false })).toEqual({
      email: true,
      dm: false,
      emailNeedsMessage: false,
    });
  });

  test("turning the email on for a notice that defaults off brings its message", () => {
    expect(pairedChannels({ ...base, defaultEmail: false, ownEmail: true })).toEqual({
      email: true,
      dm: true,
      emailNeedsMessage: false,
    });
  });

  test("turning the email back on while the message is off turns both on", () => {
    expect(pairedWrites("email", true, { dm: false, pairs: true })).toEqual([
      { channel: "dm", enabled: true },
      { channel: "email", enabled: true },
    ]);
    expect(pairedWrites("dm", false, { dm: true, pairs: true })).toEqual([
      { channel: "dm", enabled: false },
    ]);
  });
});
