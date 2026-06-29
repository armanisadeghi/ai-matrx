// File Location: app/config/metadata.ts
import { Metadata } from "next"
import { siteConfig } from "@/config/extras/site"

export const metadata: Metadata = {
    // Resolves relative OG images + canonical URLs (alternates.canonical) against
    // the production origin instead of localhost at build time.
    metadataBase: new URL(siteConfig.url),
    title: {
        default: "AI Matrx",
        template: `%s - AI Matrx`,
    },
    description: "AI Matrx is a revolutionary no-code AI platform that empowers businesses to build sophisticated AI applications without writing a single line of code. Unleash the power of AI with our intuitive drag-and-drop interface and pre-built components, streamlining your workflows and automating complex tasks. Experience the future of business automation with AI Matrx.",
    keywords: [
        "AI Matrx",
        "AI",
        "Artificial Intelligence",
        "No-Code",
        "Low-Code",
        "Automation",
        "Workflow Automation",
        "Business Automation",
        "AI Platform",
        "AI Tools",
        "AI Applications",
        "Drag-and-Drop",
        "Machine Learning",
        "Deep Learning",
        "Natural Language Processing",
        "Computer Vision",
        "Data Science",
        "AI for Business",
        "AI Solutions",
        "AI Innovation",
        "Future of Work",
        "Digital Transformation"
    ],
    authors: [
        {
            name: "Arman Sadeghi",
            url: "https://www.aimatrx.com",
        },
    ],
    creator: "Arman Sadeghi",
    openGraph: {
        type: "website",
        locale: "en_US",
        title: "AI Matrx",
        description: "AI Matrx is a revolutionary no-code AI platform that empowers businesses to build sophisticated AI applications without writing a single line of code. Unleash the power of AI with our intuitive drag-and-drop interface and pre-built components, streamlining your workflows and automating complex tasks. Experience the future of business automation with AI Matrx.",
        siteName: "AI Matrx",
        images: [
            {
                url: siteConfig.ogImage,
                width: 1200,
                height: 630,
                alt: "AI Matrx",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "AI Matrx",
        description: "A revolutionary no-code AI platform that empowers businesses to build sophisticated AI applications without writing a single line of code.",
        images: [siteConfig.ogImage],
        creator: "@your_twitter_handle",
    },
    icons: {
        icon: [
            {url: "/favicon.ico", sizes: "any"},
            {url: "/matrx/favicon-16x16.png", sizes: "16x16", type: "image/png"},
            {url: "/matrx/favicon-32x32.png", sizes: "32x32", type: "image/png"},
        ],
        apple: "/matrx/apple-touch-icon.png",
        shortcut: "/favicon.ico",
    },
    manifest: "/manifest.webmanifest",
}
