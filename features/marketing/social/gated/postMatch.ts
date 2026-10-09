/**
 * Which shared-cache post is this captured post? Mirror of aidream `services/social/post_match.py`
 * (GATED-CAPTURE.md §3). The cache keys an Instagram post by numeric media id, a page capture reads
 * the shortcode from the link; they are one post (the shortcode is the id in base 64). A post is
 * matched by every identity it can be proven to have.
 */

const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const URL_ID: Record<string, RegExp> = {
  instagram: /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
  tiktok: /\/video\/(\d+)/,
  x: /\/status(?:es)?\/(\d+)/,
  twitter: /\/status(?:es)?\/(\d+)/,
  linkedin: /(?:urn:li:(?:activity|share|ugcPost):|activity-)(\d+)/,
  facebook: /\/(?:reel|videos|posts|permalink)\/((?:pfbid)?[A-Za-z0-9]+)/,
  threads: /\/post\/([A-Za-z0-9_-]+)/,
};

/** Decimal digit arrays (little-endian) so the 64-bit ids need no BigInt (the repo's target predates ES2020). */
function mulAdd(digits: number[], mul: number, add: number): void {
  let carry = add;
  for (let i = 0; i < digits.length; i++) {
    const v = digits[i] * mul + carry;
    digits[i] = v % 10;
    carry = Math.floor(v / 10);
  }
  while (carry > 0) {
    digits.push(carry % 10);
    carry = Math.floor(carry / 10);
  }
}

export function instagramShortcodeToId(shortcode: string): string | null {
  const code = shortcode.slice(0, 11);
  if (code.length < 5) return null;
  const digits: number[] = [0];
  for (const c of code) {
    const v = IG_ALPHABET.indexOf(c);
    if (v < 0) return null;
    mulAdd(digits, 64, v);
  }
  return digits.reverse().join("");
}

export function instagramIdToShortcode(mediaId: string): string | null {
  if (!/^\d+$/.test(mediaId)) return null;
  let digits = mediaId.replace(/^0+(?=\d)/, "").split("").map(Number);
  let out = "";
  while (digits.length > 1 || digits[0] > 0) {
    let rem = 0;
    const next: number[] = [];
    for (const d of digits) {
      const cur = rem * 10 + d;
      const q = Math.floor(cur / 64);
      rem = cur % 64;
      if (next.length > 0 || q > 0) next.push(q);
    }
    out = IG_ALPHABET[rem] + out;
    digits = next.length ? next : [0];
  }
  return out || null;
}

export function idFromUrl(platform: string, url: string | null | undefined): string | null {
  const pat = URL_ID[platform.toLowerCase()];
  if (!url || !pat) return null;
  return pat.exec(url)?.[1] ?? null;
}

/** Every identity a post answers to. Compare sets: any overlap is the same post. */
export function postKeys(platform: string, platformPostId?: string | null, url?: string | null): Set<string> {
  const plat = platform.toLowerCase();
  const keys = new Set<string>();
  for (const raw of [platformPostId, idFromUrl(plat, url)]) if (raw && raw.trim()) keys.add(raw.trim());
  if (plat === "instagram") {
    for (const k of [...keys]) {
      const other = /^\d+$/.test(k) ? instagramIdToShortcode(k) : instagramShortcodeToId(k);
      if (other) keys.add(other);
    }
  }
  return keys;
}

export function samePost(
  platform: string,
  a: { platformPostId?: string | null; url?: string | null },
  b: { platformPostId?: string | null; url?: string | null },
): boolean {
  const kb = postKeys(platform, b.platformPostId, b.url);
  for (const k of postKeys(platform, a.platformPostId, a.url)) if (kb.has(k)) return true;
  return false;
}
