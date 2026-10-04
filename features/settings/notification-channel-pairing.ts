// THE PAIRING RULE, as the settings screen must show it — the same answer the server gives.
//
// Server truth: `communication.notification_pair_channels` (applied last by
// `communication.notification_user_channels`). Owner ruling, 2026-10-02:
//   - an email to a platform user never goes without a DM — the DM pairs with the email the
//     ORGANIZATION would send, so a person who turns only the email off still gets the DM;
//   - email requires DM — a person who turns a notice's DM off has turned its email off too.
// The event's `config.pair_dm_with_email` knob (default on) turns the rule off for a notice
// whose email carries a secret (a one-time code, a token link).
//
// The screen must never disagree with the send path: an email switch that shows "on" while the
// person's DM is off would be a lie they discover by NOT receiving the email. So the email shows
// off, and its slot says why (state, not prose — `emailNeedsMessage`).
//
// Pure, no imports: the same function feeds the screen and its test.

/** A channel's own choice on this rung: `undefined` = the person never said. */
export type ChannelChoice = boolean | undefined;

export interface PairingInputs {
  /** The organization/platform answer for email and dm (event defaults). */
  defaultEmail: boolean;
  defaultDm: boolean;
  /** The person's own choices (this organization's row, else their latest anywhere). */
  ownEmail: ChannelChoice;
  ownDm: ChannelChoice;
  /** `config.pair_dm_with_email` — anything but an explicit `false` is on. */
  pairs: boolean;
}

export interface PairedChannels {
  email: boolean;
  dm: boolean;
  /** The person asked for email, but turned Message off: email is off until Message is on. */
  emailNeedsMessage: boolean;
}

export function pairedChannels({
  defaultEmail,
  defaultDm,
  ownEmail,
  ownDm,
  pairs,
}: PairingInputs): PairedChannels {
  const emailAsked = ownEmail ?? defaultEmail;
  if (!pairs) {
    return { email: emailAsked, dm: ownDm ?? defaultDm, emailNeedsMessage: false };
  }
  if (ownDm === false) {
    return { email: false, dm: false, emailNeedsMessage: emailAsked };
  }
  // The DM pairs with the email the organization would send, or the one the person turned on.
  const dmOn = ownDm ?? (defaultEmail || ownEmail === true || defaultDm);
  return { email: emailAsked, dm: dmOn, emailNeedsMessage: false };
}

/** The writes one switch flip needs so the screen and the server agree afterwards. */
export function pairedWrites(
  channel: string,
  enabled: boolean,
  current: { dm: boolean; pairs: boolean },
): Array<{ channel: string; enabled: boolean }> {
  // Turning email ON while Message is off would be refused by the rule: it means "both".
  if (channel === "email" && enabled && current.pairs && !current.dm) {
    return [
      { channel: "dm", enabled: true },
      { channel: "email", enabled: true },
    ];
  }
  return [{ channel, enabled }];
}
