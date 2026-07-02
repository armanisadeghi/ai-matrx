// utils/color-utils/color-change-util.ts

'use client';

import { colord, extend, Colord } from 'colord';
import namesPlugin from 'colord/plugins/names';
import cmykPlugin from 'colord/plugins/cmyk';
import { tailwindColors } from "@/constants/tailwind-colors";
import labPlugin from "colord/plugins/lab";
import hwbPlugin from 'colord/plugins/hwb';


extend([namesPlugin, cmykPlugin, labPlugin, hwbPlugin]);

type TailwindColorGroup = (typeof tailwindColors)[number];
type TailwindShadeKey = keyof TailwindColorGroup['shades'];

function isTailwindShadeKey(group: TailwindColorGroup, shade: string): shade is TailwindShadeKey {
    return Object.prototype.hasOwnProperty.call(group.shades, shade);
}

/**
 * Function to find the hex value for a given Tailwind color string.
 * @param tailwindColorString - The Tailwind color string (e.g., 'slate-500').
 * @returns The hex value of the corresponding color (e.g., '#64748b'), or an empty string if not found.
 */
export function getColorFromTailwind(tailwindColorString: string): string {
    const [colorName, shade] = tailwindColorString.split('-');
    const colorGroup = tailwindColors.find(group => group.name.toLowerCase() === colorName.toLowerCase());
    if (colorGroup && isTailwindShadeKey(colorGroup, shade)) {
        return colorGroup.shades[shade];
    }
    return '';
}

/**
 * Function to find the nearest Tailwind color for a given input color.
 * @param inputColor - The input color as a Colord object.
 * @returns The nearest Tailwind color string (e.g., 'slate-500').
 */
export function findNearestTailwindColor(inputColor: Colord): string {
    let nearestColor = "";
    let smallestDistance = Infinity;

    tailwindColors.forEach((colorGroup) => {
        Object.entries(colorGroup.shades).forEach(([shade, hexValue]) => {
            const distance = inputColor.delta(hexValue);
            if (distance < smallestDistance) {
                smallestDistance = distance;
                nearestColor = `${colorGroup.name.toLowerCase()}-${shade}`;
            }
        });
    });

    return nearestColor;
}

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
        case 'hsvstring':
            const hsv = color.toHsv();
            return `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
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
 * Utility to format a hex string.
 * Adds the # prefix if missing.
 * @param hex - The user-provided hex color.
 * @returns A properly formatted hex color string.
 */
export function formatHex(hex: string): string {
    // Check if the hex is missing the # symbol and add it
    return hex.startsWith('#') ? hex : `#${hex}`;
}



/**
 * Utility to format an rgb string.
 * Accepts various formats like "61, 135, 204" or "(61, 135, 204)".
 * @param rgb - The user-provided rgb color.
 * @returns A properly formatted rgb color string.
 */
export function formatRgbString(rgb: string): string {
    // Extract numbers from the string
    const rgbValues = rgb.replace(/[^\d,]/g, '').split(',');
    if (rgbValues.length === 3) {
        return `rgb(${rgbValues[0].trim()}, ${rgbValues[1].trim()}, ${rgbValues[2].trim()})`;
    }
    return ''; // Return an empty string for invalid cases
}


/**
 * Utility to format an RGB object.
 * Accepts various object-like formats such as '{"r":61,"g":135,"b":204,"a":1}', '"r":61,"g":135,"b":204,"a":1', or 'r:61,g:135,b:204,a:1'.
 * @param rgbObject - The user-provided RGB object-like string.
 * @returns A properly formatted RGB object.
 */
export function formatRgbObject(rgbObject: string): string {
    // Flexible regex to match and capture r, g, b, a values, regardless of quotes, brackets, or missing attributes
    const regex = /["']?r["']?\s*[:=]\s*(\d+)\s*[,]\s*["']?g["']?\s*[:=]\s*(\d+)\s*[,]\s*["']?b["']?\s*[:=]\s*(\d+)(?:\s*[,]\s*["']?a["']?\s*[:=]\s*(\d+))?/i;
    const match = rgbObject.match(regex);

    if (match) {
        const r = match[1], g = match[2], b = match[3], a = match[4] || 1;
        // Return a normalized RGB(A) object string
        return `{"r":${r},"g":${g},"b":${b},"a":${a}}`;
    }

    // If input is invalid, return an empty string
    return '';
}



/**
 * Utility to format an HSL object.
 * Accepts various object-like formats such as '{"h":199,"s":89,"l":48,"a":1}' or 'h:199,s:89,l:48,a:1'.
 * @param hslObject - The user-provided HSL object-like string.
 * @returns A properly formatted HSL object.
 */
export function formatHslObject(hslObject: string): string {
    // Flexible regex to match and capture h, s, l, a values, regardless of quotes, brackets, or missing attributes
    const regex = /["']?h["']?\s*[:=]\s*(\d+)\s*,\s*["']?s["']?\s*[:=]\s*(\d+)\s*,\s*["']?l["']?\s*[:=]\s*(\d+)(?:\s*,\s*["']?a["']?\s*[:=]\s*(\d+))?/i;
    const match = hslObject.match(regex);
    if (match) {
        const h = match[1], s = match[2], l = match[3], a = match[4] || 1;
        return `{"h":${h},"s":${s},"l":${l},"a":${a}}`;
    }
    return ''; // Return empty string for invalid input
}


/**
 * Utility to format an HSL string.
 * Accepts formats like "hsl(199, 89%, 48%)" or "199, 89%, 48%".
 * @param hslString - The user-provided HSL string.
 * @returns A properly formatted HSL string.
 */
export function formatHslString(hslString: string): string {
    // Extract numbers and percentage values
    const hslValues = hslString.replace(/[^\d,%]/g, '').split(/\s*,\s*/);
    if (hslValues.length === 3) {
        return `hsl(${hslValues[0]}, ${hslValues[1]}%, ${hslValues[2]}%)`;
    }
    return ''; // Return empty string for invalid cases
}


/**
 * Utility to format an HSV percentage string.
 * Accepts formats like "94% 29% 0%" or "(94% 29% 0%)".
 * @param hsvString - The user-provided HSV percentage string.
 * @returns A properly formatted HSV string.
 */
export function formatHsvString(hsvString: string): string {
    // Remove parentheses and other non-relevant characters, then split based on spaces
    const hsvValues = hsvString.replace(/[^\d%\s]/g, '').split(/\s+/).map(value => parseInt(value.replace('%', ''), 10));

    // Check if there are exactly 3 values for HSV (Hue, Saturation, Value)
    if (hsvValues.length === 3 && hsvValues.every(val => !isNaN(val))) {
        return `hsv(${hsvValues[0]}, ${hsvValues[1]}%, ${hsvValues[2]}%)`;
    }
    return ''; // Return empty string for invalid input
}


/**
 * Utility to format a Tailwind color string.
 * Matches Tailwind color names and returns the closest Tailwind value.
 * Handles cases like "skyblue600", "sky598", or "sky-600".
 * @param tailwindColor - The user-provided Tailwind color string.
 * @returns A properly formatted Tailwind color string.
 */
export function formatTailwindColor(tailwindColor: string): string {
    const tailwindColorNames = [
        "Slate", "Gray", "Zinc", "Neutral", "Stone", "Red", "Orange", "Amber", "Yellow", "Lime", "Green",
        "Emerald", "Teal", "Cyan",  "Blue", "Indigo", "Violet","Sky", "Purple", "Fuchsia", "Pink", "Rose"
    ];

    // Step 1: Try to match the string to extract the numeric part (shade)
    const splitIndex = tailwindColor.search(/\d/); // Find the index where numbers start

    // Case 1: If there is no numeric part, default to shade 500
    if (splitIndex === -1) {
        const colorName = tailwindColorNames.find(color => tailwindColor.toLowerCase().includes(color.toLowerCase()));
        if (colorName) {
            return getColorFromTailwind(`${colorName.toLowerCase()}-500`); // Default to 500 if no shade provided
        }
    }

    // Case 2: There is a numeric part, so handle compound names and numeric values
    if (splitIndex > 0) {
        const colorNamePart = tailwindColor.slice(0, splitIndex);  // Get color name part
        let shadePart = tailwindColor.slice(splitIndex);  // Get shade part

        // Step 2: Find all matching color names in the provided color part
        const matchedColors = tailwindColorNames.filter(color => colorNamePart.toLowerCase().includes(color.toLowerCase()));

        // Step 3: Sort matches based on appearance in the string (we want the first match in the original string)
        matchedColors.sort((a, b) => colorNamePart.toLowerCase().indexOf(a.toLowerCase()) - colorNamePart.toLowerCase().indexOf(b.toLowerCase()));

        // Step 4: Use the first matching color name (if found)
        if (matchedColors.length > 0) {
            const colorName = matchedColors[0].toLowerCase();  // The first matched color

            // Round the shade to the nearest 100 and convert to string
            let shade = Math.round(parseInt(shadePart) / 100) * 100;
            const formattedColor = getColorFromTailwind(`${colorName}-${shade.toString()}`);

            // Return the formatted color if found
            if (formattedColor) {
                return formattedColor;
            }
        }
    }

    // If no valid format is found, return an empty string
    return '';
}

/**
 * Utility to format a regular CMYK string.
 * Accepts formats like "94, 29, 0, 9" or "(94, 29, 0, 9)".
 * @param cmykString - The user-provided CMYK string.
 * @returns A properly formatted CMYK string.
 */
export function formatRegularCmykString(cmykString: string): string {
    const cmykValues = cmykString.replace(/[^\d,]/g, '').split(/\s*,\s*/);

    if (cmykValues.length === 4 && cmykValues.every(val => !isNaN(Number(val)))) {
        return `cmyk(${cmykValues[0]}, ${cmykValues[1]}, ${cmykValues[2]}, ${cmykValues[3]})`;
    }
    return ''; // Return empty string for invalid input
}


/**
 * Utility to format a CMYK object.
 * Accepts various object-like formats such as '{"c":94,"m":29,"y":0,"k":9,"a":1}' or 'c:94,m:29,y:0,k:9,a:1'.
 * @param cmykObject - The user-provided CMYK object-like string.
 * @returns A properly formatted CMYK object.
 */
export function formatCmykObject(cmykObject: string): string {
    // Flexible regex to match and capture c, m, y, k, a values, regardless of quotes or brackets
    const regex = /["']?c["']?\s*[:=]\s*(\d+)\s*,\s*["']?m["']?\s*[:=]\s*(\d+)\s*,\s*["']?y["']?\s*[:=]\s*(\d+)\s*,\s*["']?k["']?\s*[:=]\s*(\d+)(?:\s*,\s*["']?a["']?\s*[:=]\s*(\d+))?/i;
    const match = cmykObject.match(regex);

    if (match) {
        const c = match[1], m = match[2], y = match[3], k = match[4], a = match[5] || 1;
        return `{"c":${c},"m":${m},"y":${y},"k":${k},"a":${a}}`;
    }
    return ''; // Return empty string for invalid input
}


/**
 * Utility to format a CMYK percentage string.
 * Accepts formats like "94% 29% 0% 9%" or "(94% 29% 0% 9%)".
 * @param cmykString - The user-provided CMYK percentage string.
 * @returns A properly formatted CMYK string.
 */
export function formatCmykString(cmykString: string): string {
    // Remove any parentheses or extra characters, then split based on spaces
    const cmykValues = cmykString.replace(/[^\d%\s]/g, '').split(/\s+/).map(value => parseInt(value.replace('%', ''), 10));

    if (cmykValues.length === 4 && cmykValues.every(val => !isNaN(val))) {
        return `device-cmyk(${cmykValues[0]}% ${cmykValues[1]}% ${cmykValues[2]}% ${cmykValues[3]}%)`;
    }
    return ''; // Return empty string for invalid input
}


/**
 * Utility to detect and normalize device-cmyk color strings.
 * @param cmykString - The user-provided CMYK string in the form of "device-cmyk(...)".
 * @returns A properly formatted device-cmyk string or null if invalid.
 */
function isDeviceCmyk(cmykString: string): boolean {
    const regex = /device-cmyk\(\s*\d+%\s+\d+%\s+\d+%\s+\d+%\s*\)/;
    return regex.test(cmykString);
}


/**
 * Utility to format an HWB string.
 * Accepts formats like "hwb(199 24% 20%)" or "hwb(199deg 24% 20%)".
 * @param hwbString - The user-provided HWB string.
 * @returns A properly formatted HWB string.
 */
export function formatHwbString(hwbString: string): string {
    // Extract numbers and percentage values from the HWB string
    const hwbValues = hwbString.replace(/[^\d,%\s]/g, '').split(/\s+/);
    if (hwbValues.length === 3) {
        return `hwb(${hwbValues[0]}, ${hwbValues[1]}%, ${hwbValues[2]}%)`;
    }
    return ''; // Return empty string for invalid cases
}

/**
 * Utility to format a Lab string.
 * Accepts formats like "lab(55.715 -14.02 -32.329)" or "55.715 -14.02 -32.329".
 * @param labString - The user-provided Lab string.
 * @returns A properly formatted Lab string.
 */
export function formatLabString(labString: string): string {
    console.log("Input Lab string:", labString);

    // Try matching with or without the "lab(" prefix
    const match = labString.match(/(?:lab\()?\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)?/i);

    if (match) {
        const [, l, a, b] = match;
        console.log("Matched Lab values:", l, a, b);
        return `lab(${l} ${a} ${b})`;
    }

    console.log("No match found for Lab string");
    return ''; // Return empty string for invalid cases
}

/**
 * Utility to format an LCH string.
 * Accepts formats like "lch(55.715 35.17 246.6)" or "55.715 35.17 246.6".
 * @param lchString - The user-provided LCH string.
 * @returns A properly formatted LCH string.
 */
export function formatLchString(lchString: string): string {
    console.log("Input LCH string:", lchString);

    // Try matching with or without the "lch(" prefix
    const match = lchString.match(/(?:lch\()?\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)?/i);

    if (match) {
        const [, l, c, h] = match;
        console.log("Matched LCH values:", l, c, h);
        return `lch(${l} ${c} ${h})`;
    }

    console.log("No match found for LCH string");
    return ''; // Return empty string for invalid cases
}

/**
 * Utility to format a hex string with 0x prefix.
 * Converts "0x3d87cc" to "#3d87cc".
 * @param hex - The user-provided hex color with 0x prefix.
 * @returns A properly formatted hex color string.
 */
export function formatHexWith0x(hex: string): string {
    if (hex.startsWith('0x')) {
        return `#${hex.slice(2)}`;
    }
    return ''; // Return empty string for invalid cases
}



/**
 * Unified function to attempt to normalize a user-provided color string.
 * This function tries various conversions until it finds a valid format.
 * @param colorInput - The user-provided color string.
 * @returns A validated and normalized color string, or null if invalid.
 */
/**
 * Unified function to attempt to normalize a user-provided color string.
 * This function tries various conversions until it finds a valid format.
 * @param colorInput - The user-provided color string.
 * @returns An object containing the validated and normalized color string, and the identified type, or null if invalid.
 */
export function normalizeColorInput(colorInput: string): { value: string, type: string } | null {
    console.log(`Received color input: ${colorInput}`);

    // Try standard validation first
    if (isValidColor(colorInput)) {
        console.log(`Passed standard validation: ${colorInput}`);
        return { value: colorInput, type: 'standard' };
    }

    // Check for 'device-cmyk' manually
    if (isDeviceCmyk(colorInput)) {
        console.log(`Passed device-cmyk validation: ${colorInput}`);
        return { value: colorInput, type: 'device-cmyk' };
    }

    // Try hex conversion
    const hex = formatHex(colorInput);
    if (isValidColor(hex)) {
        console.log(`Passed hex conversion: ${hex}`);
        return { value: hex, type: 'hex' };
    }

    // Try RGB string conversion
    const rgbString = formatRgbString(colorInput);
    if (isValidColor(rgbString)) {
        console.log(`Passed RGB string conversion: ${rgbString}`);
        return { value: rgbString, type: 'rgb' };
    }

    // Try RGB object conversion (skip isValidColor for this)
    const rgbObject = formatRgbObject(colorInput);
    if (rgbObject !== '') {
        console.log(`Passed RGB object conversion: ${rgbObject}`);
        return { value: rgbObject, type: 'rgb-object' };
    }

    // Try HSL object conversion (skip isValidColor for this)
    const hslObject = formatHslObject(colorInput);
    if (hslObject !== '') {
        console.log(`Passed HSL object conversion: ${hslObject}`);
        return { value: hslObject, type: 'hsl-object' };
    }

    // Try HSL string conversion
    const hslString = formatHslString(colorInput);
    if (isValidColor(hslString)) {
        console.log(`Passed HSL string conversion: ${hslString}`);
        return { value: hslString, type: 'hsl' };
    }

    // Try HSV string conversion
    const hsvString = formatHsvString(colorInput);
    if (isValidColor(hsvString)) {
        console.log(`Passed HSV string conversion: ${hsvString}`);
        return { value: hsvString, type: 'hsv' };
    }

    // Try Tailwind color conversion
    const tailwindColor = formatTailwindColor(colorInput);
    if (tailwindColor !== '') {
        console.log(`Passed Tailwind color conversion: ${tailwindColor}`);
        return { value: tailwindColor, type: 'tailwind' };
    }

    // Try regular CMYK string conversion (skip isValidColor for this)
    const regularCmykString = formatRegularCmykString(colorInput);
    if (regularCmykString !== '') {
        console.log(`Passed regular CMYK string conversion: ${regularCmykString}`);
        return { value: regularCmykString, type: 'cmyk' };
    }

    // Try CMYK object conversion (skip isValidColor for this)
    const cmykObject = formatCmykObject(colorInput);
    if (cmykObject !== '') {
        console.log(`Passed CMYK object conversion: ${cmykObject}`);
        return { value: cmykObject, type: 'cmyk-object' };
    }

    // Try CMYK percentage string conversion (for device-cmyk)
    const cmykString = formatCmykString(colorInput);
    if (isValidColor(cmykString)) {
        console.log(`Passed CMYK string conversion: ${cmykString}`);
        return { value: cmykString, type: 'cmyk-percentage' };
    }

    // Try HWB string conversion
    const hwbString = formatHwbString(colorInput);
    if (isValidColor(hwbString)) {
        console.log(`Passed HWB string conversion: ${hwbString}`);
        return { value: hwbString, type: 'hwb' };
    }

    // Try Lab string conversion (skip isValidColor for this)
    const labString = formatLabString(colorInput);
    if (labString !== '') {
        console.log(`Passed Lab string conversion: ${labString}`);
        return { value: labString, type: 'lab' };
    }

    // Try LCH string conversion (skip isValidColor for this)
    const lchString = formatLchString(colorInput);
    if (lchString !== '') {
        console.log(`Passed LCH string conversion: ${lchString}`);
        return { value: lchString, type: 'lch' };
    }

    // Try hex with 0x conversion
    const hexWith0x = formatHexWith0x(colorInput);
    if (isValidColor(hexWith0x)) {
        console.log(`Passed 0x hex conversion: ${hexWith0x}`);
        return { value: hexWith0x, type: 'hex-0x' };
    }

    // If all else fails, return null
    console.log(`Failed to validate: ${colorInput}`);
    return null;
}

























