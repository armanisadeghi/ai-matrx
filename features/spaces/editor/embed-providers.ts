// features/spaces/editor/embed-providers.ts — C23 / N16: a pasted address becomes the address its provider
// lets a page frame (Notion's "/embed" and its provider items). Pure: tested in __tests__/embed-providers.test.ts.

export type EmbedProviderKey =
  | "embed"
  | "drive"
  | "figma"
  | "gist"
  | "maps"
  | "typeform"
  | "codepen"
  | "whimsical"
  | "framer"
  | "loom"
  | "youtube"
  | "vimeo";

export interface EmbedProvider {
  key: EmbedProviderKey;
  /** The "/" item's title and the picker's heading (Notion's names). */
  title: string;
  subtext: string;
  placeholder: string;
  aliases: string[];
  /** Does this address belong to the provider? */
  matches: (url: URL) => boolean;
}

const host = (u: URL) => u.hostname.replace(/^www\./, "");

export const EMBED_PROVIDERS: EmbedProvider[] = [
  { key: "drive", title: "Google Drive", subtext: "Embed a Drive file or Google Doc.", placeholder: "Paste a Google Drive link…", aliases: ["drive", "google drive", "gdrive", "google docs", "sheets", "slides"], matches: (u) => /(^|\.)(drive|docs)\.google\.com$/.test(u.hostname) },
  { key: "figma", title: "Figma", subtext: "Embed a Figma file or prototype.", placeholder: "Paste a Figma link…", aliases: ["figma", "design"], matches: (u) => host(u) === "figma.com" },
  { key: "gist", title: "GitHub Gist", subtext: "Embed a GitHub Gist.", placeholder: "Paste a Gist link…", aliases: ["gist", "github"], matches: (u) => host(u) === "gist.github.com" },
  { key: "maps", title: "Google Maps", subtext: "Embed a Google Maps place or route.", placeholder: "Paste a Google Maps link…", aliases: ["maps", "google maps", "map", "location"], matches: (u) => (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/maps")) || u.hostname === "maps.google.com" || host(u) === "maps.app.goo.gl" },
  { key: "typeform", title: "Typeform", subtext: "Embed a Typeform.", placeholder: "Paste a Typeform link…", aliases: ["typeform", "form", "survey"], matches: (u) => /(^|\.)typeform\.com$/.test(u.hostname) },
  { key: "codepen", title: "CodePen", subtext: "Embed a CodePen pen.", placeholder: "Paste a CodePen link…", aliases: ["codepen", "pen"], matches: (u) => host(u) === "codepen.io" },
  { key: "whimsical", title: "Whimsical", subtext: "Embed a Whimsical board.", placeholder: "Paste a Whimsical link…", aliases: ["whimsical", "flowchart", "wireframe"], matches: (u) => host(u) === "whimsical.com" },
  { key: "framer", title: "Framer", subtext: "Embed a Framer site or prototype.", placeholder: "Paste a Framer link…", aliases: ["framer", "prototype"], matches: (u) => /(^|\.)framer\.(com|website|app|ai)$/.test(u.hostname) },
  { key: "loom", title: "Loom", subtext: "Embed a Loom video.", placeholder: "Paste a Loom link…", aliases: ["loom", "screen recording"], matches: (u) => host(u) === "loom.com" },
];

export const GENERIC_EMBED: EmbedProvider = {
  key: "embed",
  title: "Embed",
  subtext: "For Google Drive, Figma, Maps, CodePen, and more.",
  placeholder: "Paste in https://…",
  aliases: ["embed", "iframe", "link"],
  matches: () => true,
};

function parse(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function providerOf(raw: string): EmbedProviderKey | null {
  const u = parse(raw);
  if (!u) return null;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) return "youtube";
  if (/(^|\.)vimeo\.com$/.test(u.hostname)) return "vimeo";
  return EMBED_PROVIDERS.find((p) => p.matches(u))?.key ?? "embed";
}

/** What an embed frames: `src` (an address) or `srcDoc` (a document of our own, e.g. a Gist's script). Null = not a web address. */
export function embedTarget(raw: string): { src?: string; srcDoc?: string; provider: EmbedProviderKey } | null {
  const u = parse(raw);
  if (!u) return null;
  const provider = providerOf(raw)!;
  const url = u.toString();
  switch (provider) {
    case "youtube": {
      const id = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
      return { src: id ? `https://www.youtube.com/embed/${id}` : url, provider };
    }
    case "vimeo": {
      const id = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)?.[1];
      return { src: id ? `https://player.vimeo.com/video/${id}` : url, provider };
    }
    case "loom": {
      const id = /loom\.com\/(?:share|embed)\/([\w-]+)/.exec(url)?.[1];
      return { src: id ? `https://www.loom.com/embed/${id}` : url, provider };
    }
    case "drive": {
      // Drive files and Docs/Sheets/Slides open their /preview page; a folder its embedded folder view.
      const folder = /\/folders\/([\w-]+)/.exec(u.pathname)?.[1];
      if (folder) return { src: `https://drive.google.com/embeddedfolderview?id=${folder}#list`, provider };
      const m = /^\/(file|document|spreadsheets|presentation|forms)\/d\/([\w-]+)/.exec(u.pathname);
      if (m) {
        const base = m[1] === "file" ? "https://drive.google.com/file" : `https://docs.google.com/${m[1]}`;
        return { src: `${base}/d/${m[2]}/${m[1] === "forms" ? "viewform?embedded=true" : "preview"}`, provider };
      }
      return { src: url, provider };
    }
    case "figma":
      return { src: u.pathname.startsWith("/embed") ? url : `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`, provider };
    case "gist": {
      // A Gist is drawn by its own script: a small document of ours that loads it.
      const path = u.pathname.replace(/\.js$/, "").replace(/\/$/, "");
      if (!/^\/[\w-]+\/[0-9a-f]+$/i.test(path) && !/^\/[0-9a-f]+$/i.test(path)) return { src: url, provider };
      const script = `https://gist.github.com${path}.js`;
      return { srcDoc: `<!doctype html><html><head><base target="_blank"><style>body{margin:0}</style></head><body><script src="${script}"></script></body></html>`, provider };
    }
    case "maps": {
      if (u.pathname.startsWith("/maps/embed") || u.searchParams.get("output") === "embed") return { src: url, provider };
      const place = /\/maps\/(?:place|search)\/([^/]+)/.exec(u.pathname)?.[1];
      const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u.pathname)?.slice(1, 3).join(",");
      const q = u.searchParams.get("q") ?? (place ? decodeURIComponent(place.replace(/\+/g, " ")) : at ?? null);
      return { src: q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : url, provider };
    }
    case "typeform": {
      const id = /\/to\/([\w-]+)/.exec(u.pathname)?.[1];
      return { src: id ? `https://form.typeform.com/to/${id}` : url, provider };
    }
    case "codepen": {
      const m = /^\/([\w-]+)\/(?:pen|full|details|embed)\/([\w-]+)/.exec(u.pathname);
      return { src: m ? `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result` : url, provider };
    }
    case "whimsical":
      return { src: u.pathname.startsWith("/embed/") ? url : `https://whimsical.com/embed${u.pathname}`, provider };
    default:
      return { src: url, provider };
  }
}
