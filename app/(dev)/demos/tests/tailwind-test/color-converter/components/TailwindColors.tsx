'use client';


import React, {useState, useEffect, useRef} from 'react';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {Button} from "@/components/ui/button";
import {ChevronDown, ChevronUp} from "lucide-react";
import {tailwindColors} from "@/constants/tailwind-colors";
import {Colord, colord, extend} from "colord";
import namesPlugin from "colord/plugins/names";
import cmykPlugin from "colord/plugins/cmyk";
import {motion, useAnimation} from "motion/react";
import {getColorInfo} from "@/utils/color-utils/color-change-util";


extend([namesPlugin, cmykPlugin]);

interface TailwindColorsProps {
    onColorChange: (color: Colord) => void;
}

export default function TailwindColors({ onColorChange }: TailwindColorsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedColors, setExpandedColors] = useState({});
    const containerRef = useRef<HTMLDivElement>(null);
    const controls = useAnimation();

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (isOpen && !entry.isIntersecting) {
                    containerRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            },
            {
                root: null,
                rootMargin: '0px',
                threshold: 0.1,
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            controls.start({
                opacity: 1,
                height: "auto",
                transition: {duration: 0.5}
            }).then(() => {
                containerRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
            });

        } else {
            controls.start({
                opacity: 0,
                height: 0,
                transition: {duration: 0.5}
            });
        }
    }, [isOpen, controls]);


    const toggleColorExpand = (colorName) => {
        setExpandedColors(prev => ({...prev, [colorName]: !prev[colorName]}));
    };

    const handleColorSelect = (hex: string) => {
        const selectedColor = colord(hex);
        onColorChange(selectedColor);
    };


    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full space-y-4"
        >
            <div ref={containerRef} className="flex items-center justify-between space-x-4 px-4">
                <h2 className="text-lg font-semibold">Tailwind Colors</h2>
            </div>

            <div className="grid grid-cols-12 gap-1">
                {tailwindColors.map((colorGroup) => (
                    <div key={colorGroup.name} className="text-center">
                        <div
                            className="w-full h-20 rounded flex items-center justify-center cursor-pointer"
                            style={{backgroundColor: colorGroup.shades['500']}}
                            onClick={() => handleColorSelect(colorGroup.shades['500'])}
                        >
                            <span className="text-lg">{colorGroup.name}</span>
                        </div>
                    </div>
                ))}

                <div className="col-span-2 flex items-center justify-center">
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-full flex flex-col items-center justify-center space-y-1 py-2"
                        >
                            <span className="text-sm leading-tight break-words">
                                See All Color Variations
                            </span>
                            {isOpen ? (
                                <ChevronUp className="h-10 w-10"/>
                            ) : (
                                <ChevronDown className="h-10 w-10"/>
                            )}
                        </Button>
                    </CollapsibleTrigger>
                </div>
            </div>

            <motion.div
                animate={controls}
                initial={{opacity: 0, height: 0}}
            >
                <CollapsibleContent className="space-y-8">
                    {tailwindColors.map((colorGroup) => (
                        <div key={colorGroup.name} className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <h3 className="font-medium">{colorGroup.name}</h3>
                                <Button variant="ghost" size="sm" onClick={() => toggleColorExpand(colorGroup.name)}>
                                    {expandedColors[colorGroup.name] ? <ChevronUp className="h-4 w-4"/> :
                                        <ChevronDown className="h-4 w-4"/>}
                                </Button>
                            </div>
                            <div className="grid grid-cols-11 gap-1">
                                {Object.entries(colorGroup.shades).map(([shade, hexValue]) => {
                                    const colorInfo = getColorInfo(hexValue);
                                    return (
                                        <div key={shade} className="text-center">
                                            <div
                                                className="w-full h-20 rounded mb-1 cursor-pointer"
                                                style={{backgroundColor: hexValue}}
                                                onClick={() => handleColorSelect(hexValue)}
                                            ></div>
                                            <span
                                                className="block text-lg">{`${colorGroup.name.toLowerCase()}-${shade}`}</span>
                                            <span className="block text-sm">{hexValue}</span>
                                            <span className="block text-md">{colorInfo.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {expandedColors[colorGroup.name] && (
                                <div className="grid grid-cols-11 gap-1 text-sm">
                                    {Object.values(colorGroup.shades).map((hexValue, index) => {
                                        const colorInfo = getColorInfo(hexValue);
                                        return (
                                            <div key={index} className="text-center">
                                                <div>{`${colorInfo.rgb.r}, ${colorInfo.rgb.g}, ${colorInfo.rgb.b}`}</div>
                                                <div>{`${colorInfo.hsl.h}, ${colorInfo.hsl.s}%, ${colorInfo.hsl.l}%`}</div>
                                                <div>{`${colorInfo.cmyk.c}, ${colorInfo.cmyk.m}, ${colorInfo.cmyk.y}, ${colorInfo.cmyk.k}`}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </CollapsibleContent>
            </motion.div>
        </Collapsible>
    );
}
