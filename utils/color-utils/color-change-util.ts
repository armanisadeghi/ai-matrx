// utils/color-utils/color-change-util.ts — HOST WIRING for
// @ai-matrx/kit/color-util.
//
// The ported logic (the Tailwind nearest-color mapping + palette table, every
// fuzzy format* parser, and the normalizeColorInput waterfall) lives in the
// package and is re-exported from here. What REMAINS in this file is exactly
// the colord-coupled tier the package deliberately does not absorb: colord is
// the host's color engine, injected into the package through the structural
// seams (`{ delta(hex) }` for nearest-color, `isValid` for the normalizer).

'use client';

import { colord, extend, Colord } from 'colord';
import namesPlugin from 'colord/plugins/names';
import cmykPlugin from 'colord/plugins/cmyk';
import labPlugin from 'colord/plugins/lab';
import hwbPlugin from 'colord/plugins/hwb';
import {
    createColorNormalizer,
    findNearestTailwindColor,
} from '@ai-matrx/kit/color-util';

extend([namesPlugin, cmykPlugin, labPlugin, hwbPlugin]);

export {
    findNearestTailwindColor,
    formatCmykObject,
    formatCmykString,
    formatHex,
    formatHexWith0x,
    formatHslObject,
    formatHslString,
    formatHsvString,
    formatHwbString,
    formatLabString,
    formatLchString,
    formatRegularCmykString,
    formatRgbObject,
    formatRgbString,
    formatTailwindColor,
    getColorFromTailwind,
} from '@ai-matrx/kit/color-util';

/**
 * Comprehensive list of all supported color formats.
 * This list is used consistently across the app.
 */
export const colorFormats = [
    { name: 'Hex', value: 'hex' },
    { name: 'RGB', value: 'rgbString' },
    { name: 'HSL', value: 'hslString' },
    { name: 'CMYK', value: 'cmykString' },
    { name: 'Name', value: 'name' },
    { name: 'Tailwind Nearest', value: 'tailwindNearest' },
    { name: 'HSV', value: 'hsvString' },
];

/**
 * Utility function to get formatted color string based on the format.
 */
export function getColorString(color: Colord, format: string): string {
    switch (format.toLowerCase()) {
        case 'hex':
            return color.toHex();
        case 'rgb':
        case 'rgbstring':
            return color.toRgbString();
        case 'hsl':
        case 'hslstring':
            return color.toHslString();
        case 'hsv':
        case 'hsvstring': {
            const hsv = color.toHsv();
            return `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
        }
        case 'cmyk':
        case 'cmykstring':
            return color.toCmykString();
        case 'name':
            return color.toName() || color.toHex();
        case 'tailwind':
        case 'tailwindnearest':
            return findNearestTailwindColor(color);
        default:
            return color.toHex();
    }
}

/**
 * Unified function to return all required color formats and information.
 */
export function getColorFormats(color: Colord) {
    const hsv = color.toHsv();
    const rgb = color.toRgb();

    return {
        name: color.toName({ closest: true }) || 'N/A',
        tailwindNearest: findNearestTailwindColor(color),
        hex: color.toHex(),
        rgb,
        rgbString: color.toRgbString(),
        hsl: color.toHsl(),
        hslString: color.toHslString(),
        hsv,
        hsvString: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
        cmyk: color.toCmyk(),
        cmykString: color.toCmykString(),
    };
}

/**
 * Check if the color string is valid in any format supported by Colord.
 */
export function isValidColor(input: string): boolean {
    return colord(input).isValid();
}

/**
 * Utility function to easily convert from any format to another.
 */
export function convertColor(input: string, targetFormat: string): string | null {
    const color = colord(input);
    if (!color.isValid()) return null;
    return getColorString(color, targetFormat);
}

/**
 * Function to return all color formats and information for a given color string.
 */
export function getColorInfo(inputColor: string) {
    const color = colord(inputColor);
    if (!color.isValid()) return null;
    return getColorFormats(color);
}

/**
 * The "accept anything a human pastes" waterfall — the package's normalizer
 * with colord injected as the validity engine.
 */
export const normalizeColorInput = createColorNormalizer({
    isValid: isValidColor,
});
