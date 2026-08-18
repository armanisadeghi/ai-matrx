/**
 * The public Matrx Local release presented by the download landing page.
 * Keep every installer URL here so product surfaces never expose GitHub's
 * technical asset list or disagree about which version they recommend.
 */
export const MATRX_LOCAL_RELEASE = {
  version: "1.4.32",
  releasePage:
    "https://github.com/armanisadeghi/matrx-local/releases/tag/v1.4.32",
  downloads: {
    windows:
      "https://github.com/armanisadeghi/matrx-local/releases/download/v1.4.32/ai-matrx-windows-installer-1.4.32.exe",
    macApple:
      "https://github.com/armanisadeghi/matrx-local/releases/download/v1.4.32/ai-matrx-mac-silicon-1.4.32.dmg",
    macIntel:
      "https://github.com/armanisadeghi/matrx-local/releases/download/v1.4.32/ai-matrx-mac-intel-1.4.32.dmg",
    linux:
      "https://github.com/armanisadeghi/matrx-local/releases/download/v1.4.32/ai-matrx-linux-1.4.32.deb",
  },
} as const;

export const MATRX_LOCAL_DOWNLOAD_PATH = "/download";

export type DesktopPlatform =
  "windows" | "mac" | "linux" | "mobile" | "unknown";

/**
 * Gives the landing page a best-effort OS recommendation without collecting
 * or transmitting browser information. Mac chip type cannot be identified
 * reliably by browsers, so that choice always stays with the user.
 */
export function detectDesktopPlatform(userAgent: string): DesktopPlatform {
  const value = userAgent.toLowerCase();

  if (/iphone|ipad|ipod|android|mobile/.test(value)) return "mobile";
  if (/windows|win32|win64/.test(value)) return "windows";
  if (/macintosh|mac os x|macintel/.test(value)) return "mac";
  if (/linux|x11/.test(value)) return "linux";
  return "unknown";
}
