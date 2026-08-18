// Route handler for /education.webmanifest — the INSTALLABLE STUDY APP.
//
// Why a second manifest instead of extending /manifest.webmanifest: a manifest
// declares ONE app identity and ONE start_url. The platform manifest installs
// "AI Matrx" at "/" (the no-code AI workspace). A student installing this to a
// phone home screen expects to land in the study product, not the workspace —
// so the education surface declares its own identity and starts at /education.
// Both are the same origin and the same code; only the launch identity differs.
// (WP1 decision D-WP1-3; see common-docs/projects/education-platform.)
//
// Route-handler pattern (not app/manifest.ts) matches the sibling
// app/manifest.webmanifest/route.ts — the metadata-file convention has
// intermittently 404'd on Vercel for this project.

const manifest = {
  id: "/education",
  name: "AI Matrx Education",
  short_name: "AI Matrx Edu",
  description:
    "Flashcards, FastFire, practice tests, and an AI tutor — study anywhere, even offline.",
  start_url: "/education",
  scope: "/education",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#0b1120",
  theme_color: "#0b1120",
  categories: ["education", "productivity"],
  icons: [
    {
      src: "/matrx/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/matrx/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/matrx/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  // Long-press the installed icon → jump straight into a study surface.
  shortcuts: [
    {
      name: "Study flashcards",
      short_name: "Flashcards",
      url: "/education/flashcards",
      icons: [{ src: "/matrx/android-chrome-192x192.png", sizes: "192x192" }],
    },
    {
      name: "FastFire drill",
      short_name: "FastFire",
      url: "/education/fastfire",
      icons: [{ src: "/matrx/android-chrome-192x192.png", sizes: "192x192" }],
    },
    {
      name: "Ask the tutor",
      short_name: "Tutor",
      url: "/education/tutor",
      icons: [{ src: "/matrx/android-chrome-192x192.png", sizes: "192x192" }],
    },
  ],
} as const;

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
