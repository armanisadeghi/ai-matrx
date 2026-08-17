import type { SourceProviderConfig } from "../../../types";

export const claude: SourceProviderConfig = {
    key: "claude",
    name: "Claude",
    category: "cloud",
    support: "supported",
    tagline: "A clean full-account export, a few clicks from your settings.",
    brandColor: "#d97757",
    mark: "C",
    whatYouGet: "A .zip with conversations.json (plus projects.json and users.json).",
    delivery: {
        mechanism: "Email with a download link.",
        timing: "Usually minutes. Large accounts can take hours.",
        expiry: "The download link expires after 24 hours.",
    },
    steps: [
        {
            title: "Open your privacy settings",
            body: "Go to claude.ai in a browser, click your initials in the bottom-left corner, then Settings, then Privacy.",
            deepLink: {
                label: "Open your Claude privacy settings",
                url: "https://claude.ai/settings/data-privacy-controls",
            },
            warning: "Export works on the web and desktop only. It is not available in the iOS or Android app.",
            screenshot: {
                slot: "settings-privacy",
                caption: "The Claude Settings page with the Privacy section and the Your data area visible.",
            },
        },
        {
            title: "Request the export",
            body: "Under Your data, click Export data. Claude starts preparing your full account export.",
            screenshot: {
                slot: "export-button",
                caption: "The Export data button inside the Your data section of Claude privacy settings.",
            },
        },
        {
            title: "Download from your email",
            body: "You will get an email with a download link. Click it within 24 hours to get your .zip.",
            screenshot: {
                slot: "email-link",
                caption: "The Anthropic export-ready email with the download link visible.",
            },
        },
        {
            title: "Upload the zip here",
            body: "Upload the whole .zip. We read conversations.json inside it.",
        },
    ],
    gotchas: [
        "Deleted conversations are not included.",
        "If you edited a message and branched a chat, only the active branch is exported.",
    ],
    accepts: [".zip", "conversations.json"],
};
