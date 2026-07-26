'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHARACTERS } from '../components/CharacterSelect';

const ShapeEditor = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedShape, setSelectedShape] = useState(CHARACTERS[0].name);
    const [size, setSize] = useState(100);
    const [position, setPosition] = useState({ x: 150, y: 150 });
    const [rotation, setRotation] = useState(0);
    const [scale, setScale] = useState({ x: 1, y: 1 });

    const drawShape = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Save current context state
        ctx.save();

        // Transform context
        ctx.translate(position.x, position.y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale.x, scale.y);

        // Set drawing styles
        ctx.strokeStyle = 'currentColor';
        ctx.fillStyle = 'transparent';
        ctx.lineWidth = 2;

        // Begin new path
        ctx.beginPath();

        // Find and render selected shape
        const shape = CHARACTERS.find(c => c.name === selectedShape);
        if (shape) {
            shape.render(ctx, -size/2, -size/2, size, size);
        }

        // Stroke the path
        ctx.stroke();

        // Restore context state
        ctx.restore();
    };

    // Redraw whenever any parameter changes
    useEffect(() => {
        drawShape();
    }, [selectedShape, size, position, rotation, scale]);

    return (
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl mx-auto">
            <Card className="flex-1">
                <CardHeader>
                    <CardTitle>Shape Preview</CardTitle>
                </CardHeader>
                <CardContent>
                    <canvas
                        ref={canvasRef}
                        width={300}
                        height={300}
                        className="w-full border rounded-lg bg-background"
                    />
                </CardContent>
            </Card>

            <Card className="w-full md:w-80">
                <CardHeader>
                    <CardTitle>Controls</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                    <div className="space-y-2">
                        <Label>Shape</Label>
                        <Select value={selectedShape} onValueChange={setSelectedShape}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CHARACTERS.map(char => (
                                    <SelectItem key={char.name} value={char.name}>
                                        {char.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Size</Label>
                        <Slider
                            value={[size]}
                            onValueChange={([value]) => setSize(value)}
                            min={20}
                            max={200}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>X Position</Label>
                        <Slider
                            value={[position.x]}
                            onValueChange={([value]) => setPosition(prev => ({ ...prev, x: value }))}
                            min={0}
                            max={300}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Y Position</Label>
                        <Slider
                            value={[position.y]}
                            onValueChange={([value]) => setPosition(prev => ({ ...prev, y: value }))}
                            min={0}
                            max={300}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Rotation (degrees)</Label>
                        <Slider
                            value={[rotation]}
                            onValueChange={([value]) => setRotation(value)}
                            min={0}
                            max={360}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Scale X</Label>
                        <Slider
                            value={[scale.x * 100]}
                            onValueChange={([value]) => setScale(prev => ({ ...prev, x: value / 100 }))}
                            min={10}
                            max={200}
                            step={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Scale Y</Label>
                        <Slider
                            value={[scale.y * 100]}
                            onValueChange={([value]) => setScale(prev => ({ ...prev, y: value / 100 }))}
                            min={10}
                            max={200}
                            step={1}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ShapeEditor;