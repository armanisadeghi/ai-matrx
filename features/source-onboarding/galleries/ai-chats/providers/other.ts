import type { SourceProviderConfig } from "../../../types";

export const other: SourceProviderConfig = {
    key: "other",
    name: "Something else",
    category: "other",
    support: "tolerant",
    tagline: "Paste any conversation, or upload any file from any AI tool.",
    brandColor: "#64748b",
    mark: "+",
    whatYouGet: "Whatever you have: pasted text, or a .json, .txt, or .zip from any AI tool.",
    steps: [
        {
            title: "Paste or upload anything",
            body: "Paste conversation text straight in, or upload any .json, .txt, or .zip from any AI tool. We parse what we recognize and treat the rest as plain conversation text. You are never limited to one chat.",
        },
    ],
    accepts: [".json", ".txt", ".zip"],
};
