// components/GameSettings.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {GameConfiguration, useGameSettings} from '../hooks/useGameSettings';

interface GameSettingsProps {
    settings?: GameConfiguration;
    updateSettings?: (next: Partial<GameConfiguration>) => void;
    resetSettings?: () => void;
}

export const GameSettings = (props: GameSettingsProps = {}) => {
    // Use the shared instance passed by the page when provided (so the sliders
    // drive the live game); otherwise fall back to a standalone instance.
    const fallback = useGameSettings();
    const settings = props.settings ?? fallback.settings;
    const updateSettings = props.updateSettings ?? fallback.updateSettings;
    const resetSettings = props.resetSettings ?? fallback.resetSettings;

    const handleSliderChange = (key: keyof GameConfiguration) => (value: number[]) => {
        updateSettings({ [key]: value[0] });
    };

    return (
        <Card className="w-full max-w-3xl">
            <CardHeader>
                <CardTitle>Game Settings</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="dimensions" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
                        <TabsTrigger value="physics">Physics</TabsTrigger>
                        <TabsTrigger value="scroll">Scroll</TabsTrigger>
                        <TabsTrigger value="gameplay">Gameplay</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dimensions" className="space-y-4">
                        <div className="space-y-2">
                            <Label>Canvas Width</Label>
                            <Slider
                                value={[settings.canvasWidth]}
                                onValueChange={handleSliderChange('canvasWidth')}
                                min={300}
                                max={800}
                                step={10}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Canvas Height</Label>
                            <Slider
                                value={[settings.canvasHeight]}
                                onValueChange={handleSliderChange('canvasHeight')}
                                min={400}
                                max={1000}
                                step={10}
                            />
                        </div>
                        {/* Add other dimension controls */}
                    </TabsContent>

                    <TabsContent value="physics" className="space-y-4">
                        <div className="space-y-2">
                            <Label>Player Speed</Label>
                            <Slider
                                value={[settings.playerSpeed]}
                                onValueChange={handleSliderChange('playerSpeed')}
                                min={1}
                                max={10}
                                step={0.1}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Jump Force</Label>
                            <Slider
                                value={[Math.abs(settings.jumpForce)]}
                                onValueChange={value => updateSettings({ jumpForce: -value[0] })}
                                min={5}
                                max={20}
                                step={0.5}
                            />
                        </div>
                        {/* Add other physics controls */}
                    </TabsContent>

                    <TabsContent value="scroll" className="space-y-4">
                        <div className="space-y-2">
                            <Label>Base Scroll Speed</Label>
                            <Slider
                                value={[settings.baseScrollSpeed]}
                                onValueChange={handleSliderChange('baseScrollSpeed')}
                                min={0.1}
                                max={2}
                                step={0.1}
                            />
                        </div>
                        {/* Add other scroll controls */}
                    </TabsContent>

                    <TabsContent value="gameplay" className="space-y-4">
                        <div className="space-y-2">
                            <Label>Coin Collection Score</Label>
                            <Slider
                                value={[settings.coinCollectScore]}
                                onValueChange={handleSliderChange('coinCollectScore')}
                                min={10}
                                max={200}
                                step={10}
                            />
                        </div>
                        {/* Add other gameplay controls */}
                    </TabsContent>
                </Tabs>

                <div className="mt-6 flex justify-end">
                    <Button variant="outline" onClick={resetSettings}>
                        Reset to Defaults
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
