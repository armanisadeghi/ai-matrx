/**
 * Matrx-owned SVG assets under `/public` — HOST WIRING for
 * @ai-matrx/icons' injectable svg registry.
 *
 * The DATA lives here (add new entries when you add files under `public/`);
 * the registry mechanics live in the package. Importing this module registers
 * every path (module-scope side effect) — `app/Providers.tsx` imports it for
 * side effect so every tree has the registry populated before any `svg:` icon
 * resolves. The original function names re-export the package equivalents.
 *
 * Stored icon ids use the form `svg:<path-without-leading-slash-and-without-
 * extension>` e.g. `svg:icons/Home` → served at `/icons/Home.svg`.
 */
import {
  registerSvgIcons,
  parseSvgIconPath,
  isSvgIconValue,
  listSvgIconValues,
} from "@ai-matrx/icons";

export const MATRX_PUBLIC_SVG_PATHS: Record<string, string> = {
  "icons/Home": "/icons/Home.svg",
  "icons/brands/microsoft": "/icons/brands/microsoft.svg",
  "icons/copy": "/icons/copy.svg",
  "icons/hamburger": "/icons/hamburger.svg",
  "icons/loading-circle": "/icons/loading-circle.svg",
  "icons/logo": "/icons/logo.svg",
  "icons/play": "/icons/play.svg",
  "icons/share": "/icons/share.svg",
  "icons/three-dots": "/icons/three-dots.svg",
  "matrx/matrx-icon": "/matrx/matrx-icon.svg",
  "matrx/matrx-icon-blue": "/matrx/matrx-icon-blue.svg",
  "matrx/matrx-icon-cyan": "/matrx/matrx-icon-cyan.svg",
  "matrx/matrx-icon-green": "/matrx/matrx-icon-green.svg",
  "matrx/matrx-icon-indigo": "/matrx/matrx-icon-indigo.svg",
  "matrx/matrx-icon-orange": "/matrx/matrx-icon-orange.svg",
  "matrx/matrx-icon-pink": "/matrx/matrx-icon-pink.svg",
  "matrx/matrx-icon-purple": "/matrx/matrx-icon-purple.svg",
  "matrx/matrx-icon-slate": "/matrx/matrx-icon-slate.svg",
  "matrx/matrx-icon-teal": "/matrx/matrx-icon-teal.svg",
  "matrx/matrx-icon-yellow": "/matrx/matrx-icon-yellow.svg",
  "matrx/matrx-imagen-logo-text": "/matrx/matrx-imagen-logo-text.svg",
  "matrx/safari-pinned-tab": "/matrx/safari-pinned-tab.svg",
  "dark-turbulence-noise": "/dark-turbulence-noise.svg",
};

registerSvgIcons(MATRX_PUBLIC_SVG_PATHS);

export const parseMatrxSvgPublicPath = parseSvgIconPath;
export const isMatrxSvgIconValue = isSvgIconValue;
export const listMatrxSvgIconValues = listSvgIconValues;
