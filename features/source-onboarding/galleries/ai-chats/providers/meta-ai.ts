import type { SourceProviderConfig } from "../../../types";

export const metaAi: SourceProviderConfig = {
    key: "meta-ai",
    name: "Meta AI",
    category: "cloud",
    support: "tolerant",
    tagline: "Split across WhatsApp, Facebook, and Instagram — each has its own door.",
    brandColor: "#0668E1",
    mark: "M",
    whatYouGet: "Depends on the surface: a link covering your WhatsApp AI chats, a JSON archive from Accounts Center, or plain text you copy yourself.",
    delivery: {
        mechanism: "A download link, delivered in-app or by email depending on the surface.",
        timing: "Minutes to days.",
        expiry: "Download links last about 4 days.",
    },
    steps: [
        {
            title: "WhatsApp: ask Meta AI for your data",
            body: "Open any Meta AI chat in WhatsApp and send the message /download-all-ai-info. You get a link covering all your WhatsApp AI chats. For a single chat, you can also use Export chat, which gives plain text.",
            screenshot: {
                slot: "whatsapp-command",
                caption: "A WhatsApp Meta AI chat with the /download-all-ai-info command sent and the reply visible.",
            },
        },
        {
            title: "Facebook or Instagram: download your information",
            body: "Go to Accounts Center, then Your information and permissions, then Download your information. Choose JSON as the format, not HTML.",
            deepLink: {
                label: "Open the Meta AI chat download page",
                url: "https://privacycenter.instagram.com/dialog/download-chat-history-with-ai/",
            },
            screenshot: {
                slot: "accounts-center",
                caption: "Accounts Center with Your information and permissions open and Download your information visible.",
            },
        },
        {
            title: "meta.ai on the web: copy and paste",
            body: "The meta.ai website has no export button at all. Copying and pasting the conversations that matter is the honest path — paste them straight into the Other card here.",
        },
        {
            title: "Upload whatever you got",
            body: "Zip, JSON, or a WhatsApp .txt — upload it as-is, or paste text. We handle all of them.",
        },
    ],
    gotchas: [
        "Meta's formats shift. Upload whatever you get — our importer is built to be forgiving.",
        "Each surface exports separately. Doing two or three small exports is normal here.",
    ],
    accepts: [".zip", ".json", ".txt"],
};
