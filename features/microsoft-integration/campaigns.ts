/**
 * What a person is actually agreeing to when they connect Microsoft.
 *
 * The server declares six campaigns (`MicrosoftGraphCampaign` in
 * `aidream/services/microsoft_integrations/lifecycle.py`); each maps to an exact
 * set of delegated Graph scopes and nothing wider. This file is the ONE place
 * those campaigns are described to a human, in the sentences a person can judge:
 * what it lets AI Matrx read, and — just as loudly — what it cannot.
 *
 * The "cannot" line is not decoration. `Mail.ReadBasic` returns envelopes and
 * never a message body, and a screen that hides that sells a promise the code
 * cannot keep. Same for Teams: `Chat.Read` is chats, never channel posts and
 * never a meeting transcript.
 */

export const MICROSOFT_CAMPAIGNS = [
  "identity",
  "onedrive_files_read",
  "outlook_mail_basic",
  "outlook_calendar_basic",
  "teams_personal_read",
  "sharepoint_selected",
] as const;

export type MicrosoftCampaign = (typeof MICROSOFT_CAMPAIGNS)[number];

export interface MicrosoftCampaignDescriptor {
  readonly campaign: MicrosoftCampaign;
  readonly label: string;
  /** What AI Matrx can read once this is granted. */
  readonly grants: string;
  /** What it still cannot read, in plain words. Null only for identity. */
  readonly cannot: string | null;
  /** The exact delegated Graph scopes this campaign asks Microsoft for. */
  readonly scopes: readonly string[];
  /** Always requested — identity is how the account is named on screen. */
  readonly alwaysOn: boolean;
}

export const MICROSOFT_CAMPAIGN_DESCRIPTORS: readonly MicrosoftCampaignDescriptor[] =
  [
    {
      campaign: "identity",
      label: "Who you are",
      grants:
        "Your name and work email, so the connected account has a name on this screen.",
      cannot: null,
      scopes: ["User.Read"],
      alwaysOn: true,
    },
    {
      campaign: "onedrive_files_read",
      label: "OneDrive & SharePoint files",
      grants:
        "Read every file and folder this account can already open, including whole folder trees and large files.",
      cannot: "Change, move, or delete anything. Every read is read-only.",
      scopes: ["Files.Read"],
      alwaysOn: false,
    },
    {
      campaign: "outlook_mail_basic",
      label: "Outlook mail",
      grants:
        "List every message in the mailbox — who it is from and to, the subject, the thread, the date, and whether it has attachments. Sent mail included.",
      cannot:
        "Read the text of an email or open an attachment. That needs a wider permission we deliberately do not ask for.",
      scopes: ["Mail.ReadBasic"],
      alwaysOn: false,
    },
    {
      campaign: "outlook_calendar_basic",
      label: "Outlook calendar",
      grants:
        "Read meetings across any date range, with who was invited and who organised them.",
      cannot: "Read meeting notes or attachments, and never change an event.",
      scopes: ["Calendars.ReadBasic"],
      alwaysOn: false,
    },
    {
      campaign: "teams_personal_read",
      label: "Teams chats",
      grants:
        "Read your one-to-one and group chats, and the list of teams you are in.",
      cannot:
        "Read anything posted in a team channel, and never a meeting recording or transcript.",
      scopes: ["Chat.Read", "Team.ReadBasic.All"],
      alwaysOn: false,
    },
    {
      campaign: "sharepoint_selected",
      label: "One named SharePoint site",
      grants:
        "Read files on SharePoint sites an administrator has explicitly granted, one site at a time.",
      cannot: "Reach any site that has not been named and granted.",
      scopes: ["Sites.Selected"],
      alwaysOn: false,
    },
  ];

/** The set a person gets when they just press Connect without choosing. */
export const MICROSOFT_DEFAULT_CAMPAIGNS: readonly MicrosoftCampaign[] = [
  "identity",
  "onedrive_files_read",
  "outlook_mail_basic",
  "outlook_calendar_basic",
  "teams_personal_read",
];

export function describeMicrosoftCampaign(
  campaign: string,
): MicrosoftCampaignDescriptor | undefined {
  return MICROSOFT_CAMPAIGN_DESCRIPTORS.find(
    (descriptor) => descriptor.campaign === campaign,
  );
}

/**
 * The status codes the server's callback can hand back on the return URL
 * (`?microsoft_status=…`), each as the sentence a person reads. A code with no
 * sentence would be a screen shrugging at someone, so the fallback still says
 * something true.
 */
export const MICROSOFT_RETURN_MESSAGES: Record<
  string,
  { tone: "success" | "error"; message: string }
> = {
  connected: {
    tone: "success",
    message: "Microsoft is connected. Your account is listed below.",
  },
  reconnected: {
    tone: "success",
    message: "Microsoft was reconnected and its permissions were refreshed.",
  },
  denied: {
    tone: "error",
    message:
      "You cancelled at Microsoft's sign-in, so nothing was connected and nothing was saved.",
  },
  invalid_callback: {
    tone: "error",
    message:
      "Microsoft sent us back without an authorization code, so nothing was connected. Start the connection again.",
  },
  failed: {
    tone: "error",
    message:
      "Microsoft returned an authorization we could not complete, so nothing was saved. Start the connection again, and tell us if it keeps happening.",
  },
};

export function microsoftReturnMessage(status: string): {
  tone: "success" | "error";
  message: string;
} {
  return (
    MICROSOFT_RETURN_MESSAGES[status] ?? {
      tone: "error",
      message: `Microsoft returned an outcome this screen does not recognise (${status}). Nothing was saved — start the connection again.`,
    }
  );
}
