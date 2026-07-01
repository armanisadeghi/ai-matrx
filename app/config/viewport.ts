// File Location: app/config/viewport.ts
import { Viewport } from "next"

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    // Pinch-zoom stays ENABLED on purpose: it is the user's universal escape hatch.
    // If any surface ever overflows the viewport on mobile, the user must always be
    // able to zoom/pan out to reach cut-off content or actions — never lock them out.
    // iOS input auto-zoom is prevented the correct way instead: inputs use
    // font-size >= 16px (see CLAUDE.md mobile rules), NOT by disabling all zoom.
    maximumScale: 5,
    userScalable: true,
    // This tells browsers to resize the content when virtual keyboard appears
    // Supported by iOS Safari 15+, Chrome 108+, and modern in-app browsers like Tesla
    interactiveWidget: "resizes-content",
    themeColor: [
        {media: "(prefers-color-scheme: light)", color: "white"},
        {media: "(prefers-color-scheme: dark)", color: "black"},
    ],
}
