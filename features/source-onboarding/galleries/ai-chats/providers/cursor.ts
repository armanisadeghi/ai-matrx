import type { SourceProviderConfig } from "../../../types";

export const cursor: SourceProviderConfig = {
    key: "cursor",
    name: "Cursor",
    category: "coding",
    support: "supported",
    tagline: "Export the chats that matter as Markdown, straight from the chat menu.",
    brandColor: "#111111",
    mark: "Cur",
    whatYouGet: "One .md file per exported chat.",
    steps: [
        {
            title: "Export a chat",
            body: "In a Cursor chat, open the ... menu and choose Export Chat, then Markdown. Do this for each chat that matters.",
        },
        {
            title: "Upload the files here",
            body: "Upload the .md files. You can multi-select many files at once — do not upload them one by one.",
        },
    ],
    gotchas: [
        "Your full history lives in a local database (state.vscdb). Our desktop app will sync it automatically in the future — for now, per-chat export is the path.",
    ],
    accepts: [".md"],
};
