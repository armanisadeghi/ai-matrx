/**
 * png — a minimal PNG reader and a pixel differ, for the rendering-parity
 * sweep (DD-123 S5).
 *
 * WHY NOT A LIBRARY. The parity proof has to be reproducible on a machine that
 * has nothing installed but this repo, and it has to be auditable: a diff
 * number that decides whether organization-authored components may be framed
 * cannot come out of a black box. CDP emits 8-bit non-interlaced RGBA, which is
 * ~40 lines of well-specified unfiltering — so this reads exactly that, and
 * refuses anything else by name rather than guessing.
 */
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";

export interface Bitmap {
    w: number;
    h: number;
    /** bytes per pixel: 4 for RGBA, 3 for RGB */
    bpp: number;
    data: Buffer;
}

/** Read an 8-bit, non-interlaced RGB/RGBA PNG. Throws by name otherwise. */
export function readPng(file: string): Bitmap {
    const buf = readFileSync(file);
    let off = 8;
    let w = 0;
    let h = 0;
    let colorType = 0;
    let bitDepth = 0;
    let interlace = 0;
    const idat: Buffer[] = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString("ascii", off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === "IHDR") {
            w = data.readUInt32BE(0);
            h = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === "IDAT") {
            idat.push(data);
        }
        off += 12 + len;
    }
    if (bitDepth !== 8) {
        throw new Error(
            `This PNG is ${bitDepth} bits per channel; the parity reader only handles 8.`,
        );
    }
    if (interlace !== 0) {
        throw new Error(
            "This PNG is interlaced; the parity reader only handles non-interlaced images.",
        );
    }
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (!bpp) {
        throw new Error(
            `This PNG has colour type ${colorType}; the parity reader only handles RGB (2) and RGBA (6).`,
        );
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
        const filter = raw[p++];
        const line = raw.subarray(p, p + stride);
        p += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prev =
            y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? cur[x - bpp] : 0;
            const b = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            const v = line[x];
            let val: number;
            if (filter === 0) val = v;
            else if (filter === 1) val = v + a;
            else if (filter === 2) val = v + b;
            else if (filter === 3) val = v + ((a + b) >> 1);
            else {
                const pp = a + b - c;
                const pa = Math.abs(pp - a);
                const pb = Math.abs(pp - b);
                const pc = Math.abs(pp - c);
                val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            }
            cur[x] = val & 0xff;
        }
    }
    return { w, h, bpp, data: out };
}

export interface DiffResult {
    w: number;
    h: number;
    pixels: number;
    differing: number;
    /** percentage of compared pixels that differ by more than the tolerance */
    pct: number;
    maxDelta: number;
    sizeMatch: boolean;
    a: [number, number];
    b: [number, number];
}

/**
 * Compare two bitmaps over their common rectangle.
 *
 * `tol` is a per-channel tolerance in 0–255. 8 is the S3 noise floor: subpixel
 * antialiasing along a rounded edge lands under it, a different colour does not.
 */
export function diff(a: Bitmap, b: Bitmap, tol = 8, shiftY = 0): DiffResult {
    const w = Math.min(a.w, b.w);
    const h = Math.min(a.h, b.h) - Math.abs(shiftY);
    let differing = 0;
    let maxDelta = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ia = ((y + (shiftY < 0 ? -shiftY : 0)) * a.w + x) * a.bpp;
            const ib = ((y + (shiftY > 0 ? shiftY : 0)) * b.w + x) * b.bpp;
            let d = 0;
            for (let k = 0; k < 3; k++) {
                d = Math.max(d, Math.abs(a.data[ia + k] - b.data[ib + k]));
            }
            if (d > maxDelta) maxDelta = d;
            if (d > tol) differing++;
        }
    }
    const pixels = Math.max(w * h, 1);
    return {
        w,
        h,
        pixels,
        differing,
        pct: pixels ? +((100 * differing) / pixels).toFixed(3) : 0,
        maxDelta,
        sizeMatch: a.w === b.w && a.h === b.h,
        a: [a.w, a.h],
        b: [b.w, b.h],
    };
}

/**
 * The smallest difference over a small vertical search.
 *
 * WHY THE SEARCH. A screenshot is not deterministic to the pixel: the same
 * body, rendered twice with nothing changed, can sit ONE pixel lower. For a
 * text-heavy card that single row of displacement lights up every glyph edge
 * and reads as a 4 % difference — measured on `keyword_set_card`, which the
 * full sweep scored at 0.000 % and a later run at 4.188 %. A one-pixel
 * placement difference is not a rendering difference, so the sweep reports the
 * best alignment within a few pixels and names the offset it used. Anything
 * larger stays visible: the search is ±4, not ±40.
 */
export function bestAlignedDiff(
    a: Bitmap,
    b: Bitmap,
    tol = 8,
    maxShift = 4,
): DiffResult & { shiftY: number } {
    let best = { ...diff(a, b, tol, 0), shiftY: 0 };
    for (let s = -maxShift; s <= maxShift; s++) {
        if (s === 0) continue;
        const d = diff(a, b, tol, s);
        if (d.pct < best.pct) best = { ...d, shiftY: s };
    }
    return best;
}
