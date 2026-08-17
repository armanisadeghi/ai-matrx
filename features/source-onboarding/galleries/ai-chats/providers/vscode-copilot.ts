import type { SourceProviderConfig } from "../../../types";

export const vscodeCopilot: SourceProviderConfig = {
    key: "vscode-copilot",
    name: "VS Code Copilot",
    category: "coding",
    support: "supported",
    tagline: "One command saves the current chat session as a file.",
    brandColor: "#0078d4",
    mark: "VS",
    whatYouGet: "One .json file per exported chat session.",
    steps: [
        {
            title: "Export a session",
            body: "Open the Command Palette (Cmd+Shift+P on Mac, Ctrl+Shift+P on Windows) and run Chat: Export Chat. It saves the current session as a .json file. Repeat per session.",
        },
        {
            title: "Upload the files here",
            body: "Upload the .json files. Multi-select works — bring many at once.",
        },
    ],
    accepts: [".json"],
};
