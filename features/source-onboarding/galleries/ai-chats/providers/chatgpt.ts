import type { SourceProviderConfig } from "../../../types";

export const chatgpt: SourceProviderConfig = {
    key: "chatgpt",
    name: "ChatGPT",
    category: "cloud",
    support: "supported",
    tagline: "One export brings every conversation you have ever had.",
    brandColor: "#10a37f",
    mark: "GPT",
    whatYouGet: "A .zip containing conversations.json (every non-deleted conversation), plus chat.html and a few small files.",
    delivery: {
        mechanism: "Email from noreply@tm.openai.com with a download link. Check spam and promotions if you do not see it.",
        timing: "Usually minutes to hours. OpenAI says it can take up to a few days.",
        expiry: "The download link expires in 24 hours, and you must be signed in to the same account to download.",
    },
    steps: [
        {
            title: "Open your settings",
            body: "In ChatGPT, click your profile icon in the bottom-left corner, then choose Settings.",
            deepLink: {
                label: "Open your ChatGPT settings",
                url: "https://chatgpt.com/#settings/DataControls",
                note: "This lands you one click from the export button.",
            },
            screenshot: {
                slot: "settings-menu",
                caption: "The ChatGPT profile menu open in the bottom-left, with Settings highlighted.",
            },
        },
        {
            title: "Go to Data controls",
            body: "In the Settings panel, click Data controls. You will see an Export data option.",
            screenshot: {
                slot: "data-controls",
                caption: "The Settings panel with the Data controls tab selected and the Export data row visible.",
            },
        },
        {
            title: "Request the export",
            body: "Click Export, then Confirm. That is it — the export covers your whole account.",
            screenshot: {
                slot: "export-confirm",
                caption: "The export confirmation dialog with the Confirm export button visible.",
            },
        },
        {
            title: "Download from your email",
            body: "Watch for an email from noreply@tm.openai.com. Click the download link while signed in to the same ChatGPT account. The link dies after 24 hours, so do not sit on it.",
            warning: "The download link expires in 24 hours. If it expires, just request a new export — nothing is lost.",
            screenshot: {
                slot: "email-link",
                caption: "The OpenAI export-ready email with the download button visible.",
            },
        },
        {
            title: "Upload the zip here",
            body: "Upload the whole .zip exactly as you received it. We find conversations.json inside and handle the rest.",
        },
    ],
    gotchas: [
        "One export covers the whole account. That is good — we want many conversations, not one.",
        "Deleted chats are not included in the export.",
        "Large accounts produce big files. Upload the whole zip anyway — we handle it.",
    ],
    accepts: [".zip", "conversations.json"],
};
