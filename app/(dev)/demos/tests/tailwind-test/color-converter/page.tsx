'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { colord, Colord } from 'colord';
import ColorInput from './components/ColorInput';
import ColorConversion from './components/ColorConversion';
import ColorVisualizer from './components/ColorVisualizer';
import ColorManipulation from './components/ColorManipulation';
import ColorPicker from './components/ColorPicker';
import TailwindColors from './components/TailwindColors';
import { getColorInfo } from '@/utils/color-utils/color-change-util';

const DEFAULT_COLOR = '#3d87cc';
const DEFAULT_BACKGROUND = 'bg-background';
const DEFAULT_TEXT = 'text-foreground';

export default function ColorUtilityPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [color, setColor] = useState<Colord>(() => {
        const initialColor = searchParams.get('color') || DEFAULT_COLOR;
        return colord(initialColor);
    });
    const [format, setFormat] = useState('hex');
    const tailwindRefRef = useRef<HTMLDivElement>(null);

    const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);
    const [textColor, setTextColor] = useState(DEFAULT_TEXT);

    const handleColorChange = useCallback((newColor: Colord) => {
        setColor(newColor);
        router.push(`?color=${newColor.toHex()}`, { scroll: false });
    }, [router]);

    const handleFormatChange = useCallback((newFormat: string) => {
        setFormat(newFormat);
    }, []);

    const updateBackgroundColor = useCallback((newColor: string) => {
        const colorInfo = getColorInfo(newColor);
        if (colorInfo) {
            setBackgroundColor(`bg-[${colorInfo.hex}]`);
        }
    }, []);

    const updateTextColor = useCallback((newColor: string) => {
        const colorInfo = getColorInfo(newColor);
        if (colorInfo) {
            setTextColor(`text-[${colorInfo.hex}]`);
        }
    }, []);

    const resetColors = useCallback(() => {
        setBackgroundColor(DEFAULT_BACKGROUND);
        setTextColor(DEFAULT_TEXT);
    }, []);

    return (
        <div className={`container mx-auto p-1 space-y-8 ${backgroundColor} ${textColor}`}>
            <ColorInput
                color={color}
                format={format}
                onColorChange={handleColorChange}
                onFormatChange={handleFormatChange}
                onSetBackgroundColor={updateBackgroundColor}
                onResetColors={resetColors}
            />

            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8">
                <ColorConversion color={color} />
                <ColorVisualizer color={color} />
            </div>

            <div ref={tailwindRefRef}>
                <TailwindColors
                    onColorChange={handleColorChange}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ColorPicker color={color} onChange={handleColorChange} />
                <ColorManipulation color={color} onColorChange={handleColorChange} />
            </div>

            <div className="flex space-x-4">
                <button
                    onClick={() => updateBackgroundColor(color.toHex())}
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                    Set Background Color
                </button>
                <button
                    onClick={() => updateTextColor(color.toHex())}
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                    Set Text Color
                </button>
                <button
                    onClick={resetColors}
                    className="px-4 py-2 bg-red-500 text-white rounded"
                >
                    Reset Colors
                </button>
            </div>
        </div>
    );
}
