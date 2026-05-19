// '@/app/demo/chip/page.tsx'
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Chip, EnhancedChip } from '@/components/ui/chip';
import { Star, Heart, Stars, Flame, Zap, Crown, Diamond, Shield, Award, Trophy, Medal, Gift, Rocket } from 'lucide-react';
import TextDivider from '@/components/matrx/TextDivider';
import {Lightning} from "@mynaui/icons-react";

export default function DemoPage() {
    const [chips, setChips] = useState([
        { id: 1, label: 'Removable', variant: 'default' },
        { id: 2, label: 'Awesome', variant: 'primary' },
        { id: 3, label: 'Beautiful', variant: 'success' },
    ]);

    const handleRemove = (id: number) => {
        setChips(chips.filter(chip => chip.id !== id));
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Demo of the Chip and EnhancedChip Components</h1>

            <Tabs defaultValue="basic" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="basic">Basic Chips</TabsTrigger>
                    <TabsTrigger value="enhanced">Enhanced Chips</TabsTrigger>
                    <TabsTrigger value="sizes">Size Showcase</TabsTrigger>
                    <TabsTrigger value="interactive">Interactive Effects</TabsTrigger>
                    <TabsTrigger value="combinations">Creative Combinations</TabsTrigger>
                    <TabsTrigger value="all">All Variations</TabsTrigger>
                </TabsList>

                {/* Basic Chips Tab */}
                <TabsContent value="basic">
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Chips</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">3D Chips</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <Chip>Default</Chip>
                                        <Chip variant="primary">Primary</Chip>
                                        <Chip variant="success">Success</Chip>
                                        <Chip variant="warning">Warning</Chip>
                                        <Chip variant="danger">Danger</Chip>
                                        <Chip variant="purple">Purple</Chip>
                                        <Chip variant="pink">Pink</Chip>
                                        <Chip variant="indigo">Indigo</Chip>
                                        <Chip variant="teal">Teal</Chip>
                                        <Chip variant="orange">Orange</Chip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Gradient Chips</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <Chip gradient>Default</Chip>
                                        <Chip variant="primary" gradient>Primary</Chip>
                                        <Chip variant="success" gradient>Success</Chip>
                                        <Chip variant="warning" gradient>Warning</Chip>
                                        <Chip variant="danger" gradient>Danger</Chip>
                                        <Chip variant="purple" gradient>Purple</Chip>
                                        <Chip variant="pink" gradient>Pink</Chip>
                                        <Chip variant="indigo" gradient>Indigo</Chip>
                                        <Chip variant="teal" gradient>Teal</Chip>
                                        <Chip variant="orange" gradient>Orange</Chip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Sizes</h3>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <Chip size="sm">Small</Chip>
                                        <Chip size="md">Medium</Chip>
                                        <Chip size="lg">Large</Chip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Removable</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <Chip onRemove={() => console.log('removed')}>Removable</Chip>
                                        <Chip variant="primary" gradient onRemove={() => console.log('removed')}>Remove Me</Chip>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Enhanced Chips Tab */}
                <TabsContent value="enhanced">
                    <Card>
                        <CardHeader>
                            <CardTitle>Enhanced Chips</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">3D Chips with Icons</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <EnhancedChip icon={Star}>Default</EnhancedChip>
                                        <EnhancedChip variant="primary" icon={Heart}>Primary</EnhancedChip>
                                        <EnhancedChip variant="success" icon={Stars}>Success</EnhancedChip>
                                        <EnhancedChip variant="warning" icon={Flame}>Warning</EnhancedChip>
                                        <EnhancedChip variant="danger" icon={Zap}>Danger</EnhancedChip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Animated Gradient Chips</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <EnhancedChip variant="primary" gradient animated icon={Crown}>Animated</EnhancedChip>
                                        <EnhancedChip variant="purple" gradient animated icon={Diamond}>Purple</EnhancedChip>
                                        <EnhancedChip variant="teal" gradient animated icon={Shield}>Teal</EnhancedChip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Glowing Effects</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <EnhancedChip variant="primary" glow>Glowing</EnhancedChip>
                                        <EnhancedChip variant="success" glow gradient>Success</EnhancedChip>
                                        <EnhancedChip variant="warning" glow icon={Flame}>Warning</EnhancedChip>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Working Remove Function</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {chips.map(chip => (
                                            <EnhancedChip key={chip.id} variant={chip.variant} onRemove={() => handleRemove(chip.id)} icon={Star}>
                                                {chip.label}
                                            </EnhancedChip>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="sizes">
                    <Card>
                        <CardHeader>
                            <CardTitle>Size Variations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TextDivider text="All Available Sizes" />
                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <EnhancedChip size="xs" icon={Star}>Extra Small</EnhancedChip>
                                    <EnhancedChip size="sm" icon={Star}>Small</EnhancedChip>
                                    <EnhancedChip size="md" icon={Star}>Medium</EnhancedChip>
                                    <EnhancedChip size="lg" icon={Star}>Large</EnhancedChip>
                                    <EnhancedChip size="xl" icon={Star}>Extra Large</EnhancedChip>
                                    <EnhancedChip size="2xl" icon={Star}>2X Large</EnhancedChip>
                                    <EnhancedChip size="3xl" icon={Star}>3X Large</EnhancedChip>
                                </div>

                                <TextDivider text="Gradient Sizes" />
                                <div className="flex flex-wrap gap-2 items-center">
                                    {['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].map((size) => (
                                        <EnhancedChip
                                            key={size}
                                            size={size}
                                            gradient
                                            variant="primary"
                                            icon={Crown}
                                        >
                                            {size.toUpperCase()}
                                        </EnhancedChip>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Interactive Effects Tab */}
                <TabsContent value="interactive">
                    <Card>
                        <CardHeader>
                            <CardTitle>Interactive Effects</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TextDivider text="Hover Animations" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="primary" animated icon={Rocket}>Hover Me!</EnhancedChip>
                                <EnhancedChip variant="success" animated glow icon={Stars }>Hover Glow</EnhancedChip>
                                <EnhancedChip variant="warning" gradient animated icon={Lightning}>Hover Gradient</EnhancedChip>
                            </div>

                            <TextDivider text="Glow Intensities" />
                            <div className="flex flex-wrap gap-2">
                                {['primary', 'success', 'warning', 'purple', 'pink'].map((variant) => (
                                    <EnhancedChip
                                        key={variant}
                                        variant={variant}
                                        glow
                                        icon={Stars}
                                    >
                                        {variant} glow
                                    </EnhancedChip>
                                ))}
                            </div>

                            <TextDivider text="Interactive Removable" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="primary" onRemove={() => {}} animated glow>
                                    Click X
                                </EnhancedChip>
                                <EnhancedChip variant="success" onRemove={() => {}} gradient animated>
                                    Remove Me
                                </EnhancedChip>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Creative Combinations Tab */}
                <TabsContent value="combinations">
                    <Card>
                        <CardHeader>
                            <CardTitle>Creative Combinations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TextDivider text="Achievement Chips" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="primary" gradient glow icon={Trophy}>Champion</EnhancedChip>
                                <EnhancedChip variant="success" gradient animated icon={Medal}>Winner</EnhancedChip>
                                <EnhancedChip variant="purple" glow animated icon={Crown}>Elite</EnhancedChip>
                            </div>

                            <TextDivider text="Status Indicators" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="success" glow icon={Shield}>Active</EnhancedChip>
                                <EnhancedChip variant="warning" animated icon={Flame}>Pending</EnhancedChip>
                                <EnhancedChip variant="destructive" gradient icon={Zap}>Critical</EnhancedChip>
                            </div>

                            <TextDivider text="Special Effects" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip
                                    variant="primary"
                                    gradient
                                    animated
                                    glow
                                    icon={Gift}
                                    size="lg"
                                >
                                    Ultimate
                                </EnhancedChip>
                                <EnhancedChip
                                    variant="purple"
                                    gradient
                                    animated
                                    glow
                                    icon={Diamond}
                                    size="lg"
                                >
                                    Premium
                                </EnhancedChip>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* All Variations Tab */}
                <TabsContent value="all">
                    <Card>
                        <CardHeader>
                            <CardTitle>All Variations</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TextDivider text="Basic 3D Chips" />
                            <div className="flex flex-wrap gap-2">
                                <Chip>Default</Chip>
                                <Chip variant="primary">Primary</Chip>
                                <Chip variant="success">Success</Chip>
                                <Chip variant="warning">Warning</Chip>
                                <Chip variant="danger">Danger</Chip>
                            </div>

                            <TextDivider text="Enhanced Chips with Icons" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip icon={Star}>Default</EnhancedChip>
                                <EnhancedChip variant="primary" icon={Heart}>Primary</EnhancedChip>
                                <EnhancedChip variant="success" icon={Stars}>Success</EnhancedChip>
                                <EnhancedChip variant="warning" icon={Flame}>Warning</EnhancedChip>
                                <EnhancedChip variant="danger" icon={Zap}>Danger</EnhancedChip>
                            </div>

                            <TextDivider text="Animated Gradient Chips" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="primary" gradient animated icon={Crown}>Animated</EnhancedChip>
                                <EnhancedChip variant="purple" gradient animated icon={Diamond}>Purple</EnhancedChip>
                                <EnhancedChip variant="teal" gradient animated icon={Shield}>Teal</EnhancedChip>
                            </div>

                            <TextDivider text="Glowing Effects" />
                            <div className="flex flex-wrap gap-2">
                                <EnhancedChip variant="primary" glow>Glowing</EnhancedChip>
                                <EnhancedChip variant="success" glow gradient>Success</EnhancedChip>
                                <EnhancedChip variant="warning" glow icon={Flame}>Warning</EnhancedChip>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
