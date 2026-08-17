import type { SourceProviderConfig } from "../../../types";

export const grok: SourceProviderConfig = {
    key: "grok",
    name: "Grok",
    category: "cloud",
    support: "tolerant",
    tagline: "A quick export from grok.com — newer and rougher than the others, and that is fine.",
    brandColor: "#000000",
    mark: "X",
    whatYouGet: "Machine-readable JSON of your conversations.",
    delivery: {
        mechanism: "Email with a download link.",
        timing: "Usually minutes.",
    },
    steps: [
        {
            title: "Open Grok's data controls",
            body: "On grok.com, open Settings, then Data Controls, then Export account data. This sends you to xAI's data page.",
            deepLink: {
                label: "Open the xAI data page",
                url: "https://accounts.x.ai/data",
            },
            screenshot: {
                slot: "grok-settings",
                caption: "Grok settings with Data Controls open and the Export account data option visible.",
            },
        },
        {
            title: "Request your download",
            body: "On the xAI data page, request the download. You will get an email link, usually within minutes.",
            screenshot: {
                slot: "xai-data-page",
                caption: "The accounts.x.ai data page with the download request button visible.",
            },
        },
        {
            title: "Upload the file here",
            body: "Upload whatever file you receive. If it looks odd, upload it anyway — our importer is built to be forgiving.",
        },
    ],
    gotchas: [
        "If you use Grok inside X (not grok.com): X's archive is under Settings, Your account, Download an archive of your data. It takes about 24 hours, asks you to verify your identity, and Grok chats are NOT guaranteed to be included.",
        "xAI's export is newer and less polished than the others. Worst case, copy and paste the chats that matter — that always works.",
    ],
    accepts: [".json", ".zip"],
};
