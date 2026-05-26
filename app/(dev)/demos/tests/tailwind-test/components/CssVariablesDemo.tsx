import React from 'react';
import { Button } from "@/components/ui/button";

const TailwindDemo = () => {
    return (
        <div className="p-8 bg-background text-foreground">
            <h1 className="text-4xl font-bold mb-6 text-center text-primary font-heading">Tailwind CSS Demo (Updated
                Theme)</h1>

            {/* Colors */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Colors</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div
                        className="p-4 bg-background text-foreground border border-border hover:bg-foreground hover:text-background transition-colors duration-300">Background
                    </div>
                    <div
                        className="p-4 bg-card text-card-foreground border border-border hover:scale-105 transition-transform duration-300">Card
                    </div>
                    <div
                        className="p-4 bg-popover text-popover-foreground border border-border hover:shadow-lg transition-shadow duration-300">Popover
                    </div>
                    <div
                        className="p-4 bg-primary text-primary-foreground border border-border hover:opacity-80 transition-opacity duration-300">Primary
                    </div>
                    <div
                        className="p-4 bg-secondary text-secondary-foreground border border-border hover:rotate-3 transition-transform duration-300">Secondary
                    </div>
                    <div
                        className="p-4 bg-muted text-muted-foreground border border-border hover:border-primary hover:border-2 transition-all duration-300">Muted
                    </div>
                    <div className="p-4 bg-accent text-accent-foreground border border-border hover:underline">Accent
                    </div>
                    <div
                        className="p-4 bg-destructive text-destructive-foreground border border-border hover:animate-pulse">Destructive
                    </div>
                    <div
                        className="p-4 bg-card text-foreground border border-input hover:bg-input hover:text-background transition-colors duration-300">Input
                    </div>
                    <div
                        className="p-4 bg-card text-foreground border-2 border-ring hover:ring-4 hover:ring-ring transition-all duration-300">Ring
                    </div>
                    <div
                        className="p-4 bg-[hsl(var(--chart-1))] text-foreground border border-border hover:blur-sm transition-all duration-300">Chart
                        1
                    </div>
                    <div
                        className="p-4 bg-[hsl(var(--chart-2))] text-foreground border border-border hover:grayscale transition-all duration-300">Chart
                        2
                    </div>
                    <div
                        className="p-4 bg-[hsl(var(--chart-3))] text-foreground border border-border hover:skew-x-6 transition-transform duration-300">Chart
                        3
                    </div>
                    <div
                        className="p-4 bg-[hsl(var(--chart-4))] text-foreground border border-border hover:translate-y-1 transition-transform duration-300">Chart
                        4
                    </div>
                    <div className="p-4 bg-[hsl(var(--chart-5))] text-foreground border border-border group">
                        <span className="group-hover:font-bold transition-all duration-300">Chart 5</span>
                    </div>
                </div>
            </div>

            {/* Buttons */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Buttons and Hover Effects</h2>
                <div className="space-y-4">
                    <div>
                        <Button className="mr-4">Default Button</Button>
                        <Button variant="secondary" className="mr-4">Secondary Button</Button>
                        <Button variant="destructive" className="mr-4">Destructive Button</Button>
                    </div>
                    <div>
                        <Button variant="outline" className="mr-4">Outline Button</Button>
                        <Button variant="ghost" className="mr-4">Ghost Button</Button>
                        <Button variant="link" className="mr-4">Link Button</Button>
                    </div>
                </div>
            </div>

            {/* Input with focus state */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Input Focus State</h2>
                <input
                    type="text"
                    placeholder="Focus me"
                    className="w-full max-w-sm border-2 border-input focus:border-ring focus:ring-2 focus:ring-ring rounded-md p-2 bg-background text-foreground outline-none transition-all duration-200"
                />
            </div>

            {/* Typography */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Typography</h2>
                <p className="text-xs mb-2">text-xs: Extra small text</p>
                <p className="text-sm mb-2">text-sm: Small text</p>
                <p className="text-base mb-2">text-base: Base text size</p>
                <p className="text-lg mb-2">text-lg: Large text</p>
                <p className="text-xl mb-2">text-xl: Extra large text</p>
                <p className="text-2xl mb-2 font-heading">text-2xl: 2X large text (Heading)</p>
                <p className="text-3xl mb-2 font-heading">text-3xl: 3X large text (Heading)</p>
                <p className="text-4xl mb-2 font-heading">text-4xl: 4X large text (Heading)</p>
                <p className="text-5xl mb-2 font-heading">text-5xl: 5X large text (Heading)</p>
                <p className="font-light mb-2">font-light: Light weight</p>
                <p className="font-normal mb-2">font-normal: Normal weight</p>
                <p className="font-medium mb-2">font-medium: Medium weight</p>
                <p className="font-semibold mb-2">font-semibold: Semibold weight</p>
                <p className="font-bold mb-2">font-bold: Bold weight</p>
            </div>

            {/* Hover and Focus States */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Hover and Focus States</h2>
                <button
                    className="bg-primary hover:bg-primary/80 text-primary-foreground font-bold py-2 px-4 rounded mr-4 transition-colors duration-200">
                    Hover me (Primary)
                </button>
                <button
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold py-2 px-4 rounded mr-4 transition-colors duration-200">
                    Hover me (Secondary)
                </button>
                <button
                    className="bg-accent hover:bg-accent/80 text-accent-foreground font-bold py-2 px-4 rounded mr-4 transition-colors duration-200">
                    Hover me (Accent)
                </button>
                <input
                    type="text"
                    placeholder="Focus me"
                    className="mt-4 border-2 border-input focus:border-ring focus:ring-2 focus:ring-ring rounded-md p-2 bg-background text-foreground outline-none transition-all duration-200"
                />
            </div>

            {/* Borders and Shadows */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Borders and Shadows</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-card border border-border rounded">Default Border</div>
                    <div className="p-4 bg-card border-2 border-primary rounded">Primary Border</div>
                    <div className="p-4 bg-card border-2 border-secondary rounded">Secondary Border</div>
                    <div className="p-4 bg-card border-2 border-accent rounded">Accent Border</div>
                    <div className="p-4 bg-card border-2 border-muted rounded">Muted Border</div>
                    <div className="p-4 bg-card border-2 border-input rounded">Input Border</div>
                    <div className="p-4 bg-card shadow-sm">Shadow Small</div>
                    <div className="p-4 bg-card shadow">Shadow Default</div>
                    <div className="p-4 bg-card shadow-md">Shadow Medium</div>
                    <div className="p-4 bg-card shadow-lg">Shadow Large</div>
                    <div className="p-4 bg-card shadow-xl">Shadow Extra Large</div>
                </div>
            </div>

            {/* Matrix Border Example */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Matrix Border Example</h2>
                <div className="grid grid-cols-3 gap-4 border-2 border-matrixBorder p-4">
                    <div className="p-4 bg-[hsl(var(--chart-1))] text-foreground">Cell 1</div>
                    <div className="p-4 bg-[hsl(var(--chart-2))] text-foreground">Cell 2</div>
                    <div className="p-4 bg-[hsl(var(--chart-3))] text-foreground">Cell 3</div>
                    <div className="p-4 bg-[hsl(var(--chart-4))] text-foreground">Cell 4</div>
                    <div className="p-4 bg-[hsl(var(--chart-5))] text-foreground">Cell 5</div>
                    <div className="p-4 bg-primary text-primary-foreground">Cell 6</div>
                </div>
            </div>

            {/* Checkerboard Pattern */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Checkerboard Pattern</h2>
                <div className="bg-checkerboard w-full h-32 rounded-lg"></div>
            </div>

            {/* Animations */}
            <div className="bg-card text-card-foreground rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4 font-heading">Animations</h2>
                <div className="space-y-4">
                    <div className="animate-accordion-down bg-muted p-4 rounded-lg">Accordion Down</div>
                    <div className="animate-accordion-up bg-muted p-4 rounded-lg">Accordion Up</div>
                    <div className="flex items-center">
                        <span className="mr-2">Caret Blink:</span>
                        <span className="animate-caret-blink">|</span>
                    </div>
                    <div className="relative overflow-hidden rounded-lg">
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer"
                            style={{backgroundSize: '200% 100%'}}></div>
                        <div className="relative z-10 bg-muted p-4">Shimmer Effect</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TailwindDemo;
