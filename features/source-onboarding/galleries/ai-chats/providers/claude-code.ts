import type { SourceProviderConfig } from "../../../types";

export const claudeCode: SourceProviderConfig = {
    key: "claude-code",
    name: "Claude Code",
    category: "coding",
    support: "supported",
    tagline: "Your sessions are already files on your machine — upload them directly.",
    brandColor: "#d97757",
    mark: "CC",
    whatYouGet: "One .jsonl file per session, straight from your machine.",
    steps: [
        {
            title: "Find your session files",
            body: "Sessions live in the .claude/projects folder in your home directory, as .jsonl files. Upload them directly — multi-select works. Or, inside a session, run the /export command.",
        },
        {
            title: "Upload the files here",
            body: "Upload the .jsonl files as-is. We understand the format.",
        },
    ],
    gotchas: [
        "This one is for people who code with Claude. If that is not you, skip it — no harm done.",
        "If you use AI Matrx's coding bridge, your sessions may already be inside AI Matrx — see the AI Matrx card.",
    ],
    accepts: [".jsonl"],
};
