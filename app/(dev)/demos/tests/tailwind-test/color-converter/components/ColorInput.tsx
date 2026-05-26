'use client';

import React, {useState, useEffect} from 'react';
import {colord, Colord} from 'colord';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardTitle} from '@/components/ui/card';
import {HexColorPicker} from 'react-colorful';
import {tailwindColors} from '@/constants/tailwind-colors';
import {predefinedColors} from '@/constants/standard-colors';
import {colorFormats, getColorString, isValidColor, normalizeColorInput} from '@/utils/color-utils/color-change-util';
import {useAppSelector, useAppDispatch} from '@/lib/redux/hooks';
import {setMode} from '@/styles/themes/themeSlice';
import {Sun, Moon, CheckCircle, AlertTriangle} from 'lucide-react';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';

export default function ColorInput(
    {
        color,
        format,
        onColorChange,
        onFormatChange,
        onSetBackgroundColor,
        onResetColors,
    }: {
        color: Colord;
        format: string;
        onColorChange: (color: Colord) => void;
        onFormatChange: (format: string) => void;
        onSetBackgroundColor: (color: string) => void;
        onResetColors: () => void;
    }) {
    const [inputValue, setInputValue] = useState(getColorString(color, format));
    const theme = useAppSelector((s) => s.theme.mode);
    const dispatch = useAppDispatch();
    const setTheme = (t: 'light' | 'dark') => dispatch(setMode(t));
    const [mounted, setMounted] = useState(false);
    const [isInputValid, setIsInputValid] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [normalizedValue, setNormalizedValue] = useState('');
    const [normalizedType, setNormalizedType] = useState('');
    const [autoFixEnabled, setAutoFixEnabled] = useState(true);
    const [selectedTailwindColor, setSelectedTailwindColor] = useState<{
        name: string;
        shades: Record<string, string>
    } | null>(null);
    const [detectedType, setDetectedType] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setInputValue(getColorString(color, format));
    }, [color, format]);

    const handleInputChange = (value: string) => {
        setInputValue(value);
        const normalized = normalizeColorInput(value);
        if (normalized) {
            setIsInputValid(true);
            setNormalizedValue(normalized.value);
            setDetectedType(normalized.type);

            if (normalized.type === format) {
                onColorChange(colord(normalized.value));
            }
        } else {
            setIsInputValid(false);
            setNormalizedValue('');
            setDetectedType('');
        }
    };

    const handleUpdateClick = () => {
        if (isInputValid) {
            if (detectedType === format) {
                onColorChange(colord(normalizedValue));
            } else {
                setModalMessage(`The input is a valid ${detectedType} color, but the current format is set to ${format}. Please change the format to ${detectedType} to apply this color.`);
                setShowModal(true);
            }
        } else {
            setModalMessage(`The color input "${inputValue}" is not a valid color.`);
            setShowModal(true);
        }
    };

    const handleTailwindColorClick = (colorGroup: { name: string; shades: Record<string, string> }) => {
        setSelectedTailwindColor(colorGroup);
        onColorChange(colord(colorGroup.shades['500']));
    };

    const handleShadeClick = (shade: string) => {
        onColorChange(colord(shade));
    };

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    if (!mounted) {
        return <div>Loading...</div>;
    }

    return (
        <Card className="p-2 bg-background dark:bg-background">
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-foreground dark:text-foreground">Color Input</CardTitle>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={format} onValueChange={onFormatChange}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Color format"/>
                        </SelectTrigger>
                        <SelectContent>
                            {colorFormats.map((format) => (
                                <SelectItem key={format.value} value={format.value}>
                                    {format.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input
                        type="text"
                        placeholder={`Enter ${format} color`}
                        value={inputValue}
                        onChange={(e) => handleInputChange(e.target.value)}
                        className={`w-[200px] ${isInputValid ? '' : 'border-red-500'}`}
                    />

                    {detectedType && (
                        <div
                            className={`text-sm font-medium ${detectedType !== format ? 'text-yellow-500 dark:text-yellow-400' : 'text-green-500 dark:text-green-400'}`}>
                            Detected: {detectedType}
                        </div>
                    )}

                    <div className="flex items-center space-x-2">
                        <Switch
                            id="auto-fix"
                            checked={autoFixEnabled}
                            onCheckedChange={setAutoFixEnabled}
                        />
                        <Label htmlFor="auto-fix" className="whitespace-nowrap">Auto Fix</Label>
                    </div>

                    <Button onClick={handleUpdateClick} variant="ghost" className="w-[200px] p-2 flex items-center">
                        <CheckCircle className="mr-2 h-4 w-4"/>
                        <span>Validate Color</span>
                    </Button>

                    <Button
                        onClick={toggleTheme}
                        className="w-[200px] bg-secondary hover:bg-secondary/70 text-secondary-foreground whitespace-nowrap"
                    >
                        {theme === 'dark' ? (
                            <>
                                <Sun className="mr-2 h-4 w-4"/>
                                Light
                            </>
                        ) : (
                            <>
                                <Moon className="mr-2 h-4 w-4"/>
                                Dark
                            </>
                        )}
                    </Button>
                </div>

                {showModal && (
                    <Dialog open={showModal} onOpenChange={setShowModal}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Color Input Information</DialogTitle>
                                <DialogDescription>
                                    <p>{modalMessage}</p>
                                </DialogDescription>
                            </DialogHeader>
                        </DialogContent>
                    </Dialog>
                )}

                <div className="flex flex-wrap gap-2">
                    <div className="grid grid-cols-6 gap-1">
                        {tailwindColors.map((colorGroup) => (
                            <div key={colorGroup.name} className="text-center">
                                <div
                                    className="w-16 h-16 cursor-pointer flex items-center justify-center"
                                    style={{ backgroundColor: colorGroup.shades['500'] }}
                                    onClick={() => handleTailwindColorClick(colorGroup)}
                                >
                  <span className="text-sm text-white truncate">
                    {colorGroup.name}
                  </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {selectedTailwindColor && (
                        <div className="grid grid-cols-2 gap-1 w-52 auto-rows-min">
                            {Object.entries(selectedTailwindColor.shades).map(([shade, colorValue], index) => (
                                <div
                                    key={shade}
                                    className="h-10 cursor-pointer flex items-center justify-between px-2"
                                    style={{ backgroundColor: colorValue }}
                                    onClick={() => handleShadeClick(colorValue)}
                                >
                                  <span className="text-sm font-semibold" style={{ color: parseInt(shade) > 500 ? 'white' : 'black' }}>
                                    {selectedTailwindColor.name}
                                  </span>
                                    <span className="text-sm" style={{ color: parseInt(shade) > 500 ? 'white' : 'black' }}>
                                    {shade}
                                  </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex-shrink-0">
                        <HexColorPicker color={color.toHex()} onChange={(hex) => {
                            onColorChange(colord(hex));
                            setSelectedTailwindColor(null);
                        }}/>
                    </div>

                    <div>
                        <div className="grid grid-cols-10 gap-1">
                            {predefinedColors.map((colorHex, index) => (
                                <div
                                    key={index}
                                    className="w-6 h-6 cursor-pointer"
                                    style={{backgroundColor: colorHex}}
                                    onClick={() => {
                                        onColorChange(colord(colorHex));
                                        setSelectedTailwindColor(null);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
