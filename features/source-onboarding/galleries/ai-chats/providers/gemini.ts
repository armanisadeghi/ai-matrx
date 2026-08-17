import type { SourceProviderConfig } from "../../../types";

export const gemini: SourceProviderConfig = {
    key: "gemini",
    name: "Gemini",
    category: "cloud",
    support: "supported",
    tagline: "Your chats come through Google Takeout — two traps, both avoidable.",
    brandColor: "#1a73e8",
    mark: "G",
    whatYouGet: "A Takeout archive containing Takeout/My Activity/Gemini Apps/MyActivity.json.",
    delivery: {
        mechanism: "Email from Google when the export is ready.",
        timing: "Minutes to about a day, depending on how much data you selected.",
        expiry: "The download link lasts 7 days.",
    },
    steps: [
        {
            title: "Open Google Takeout and deselect everything",
            body: "Go to takeout.google.com and click Deselect all at the top of the product list. You only want one thing, and it is not where you would expect.",
            deepLink: {
                label: "Open Google Takeout",
                url: "https://takeout.google.com",
                note: "The two checkboxes in the next steps still need to be done by hand.",
            },
            warning: "Do NOT check the top-level Gemini box. It exports only your Gems — not your conversations. Your chats live under My Activity.",
            screenshot: {
                slot: "takeout-deselect",
                caption: "Google Takeout with Deselect all clicked and the product list unchecked.",
            },
        },
        {
            title: "Check My Activity, then narrow it to Gemini Apps",
            body: "Scroll down to My Activity and check it. Then click the button that says All activity data included, deselect all, and check only Gemini Apps.",
            screenshot: {
                slot: "my-activity-filter",
                caption: "The My Activity content options dialog with only Gemini Apps checked.",
            },
        },
        {
            title: "Switch the format to JSON",
            body: "Still on My Activity, click Multiple formats and change Activity records from HTML to JSON. This is the second trap — the default is HTML, which we cannot mine as well.",
            warning: "The default format is HTML. You must click Multiple formats and switch Activity records to JSON.",
            screenshot: {
                slot: "format-json",
                caption: "The Multiple formats dialog with Activity records set to JSON.",
            },
        },
        {
            title: "Create the export",
            body: "Click Next step, then Create export. Google emails you when it is ready.",
            screenshot: {
                slot: "create-export",
                caption: "The Takeout export destination screen with the Create export button visible.",
            },
        },
        {
            title: "Upload the archive here",
            body: "Download the archive from the email and upload it whole. We find the Gemini Apps activity file inside and re-thread it into conversations for you.",
        },
    ],
    gotchas: [
        "If Gemini Apps Activity was turned off, or auto-delete was on, those chats are simply missing — Google never kept them.",
        "Your conversations arrive as an activity log, not neat threads. We re-thread them for you.",
        "Work or school (Workspace) accounts may have Takeout disabled by an admin.",
    ],
    accepts: [".zip", ".tgz", "MyActivity.json"],
};
