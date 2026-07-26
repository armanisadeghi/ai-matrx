// components/game/CharacterSelect.tsx
'use client';

import React from 'react';
import { Square, Circle, Triangle, Star, Ghost, Bird, Heart, Flower } from 'lucide-react';
import { PiButterflyFill } from "react-icons/pi";
import { GiSeaDragon } from "react-icons/gi";

import type { Character } from '../types';

const CHARACTERS: Character[] = [
    {
        icon: Square,
        name: 'Square',
        render: (ctx, x, y, width, height) => {
            ctx.rect(x, y, width, height);
        }
    },
    {
        icon: Circle,
        name: 'Circle',
        render: (ctx, x, y, width, height) => {
            ctx.arc(x + width/2, y + height/2, width/2, 0, Math.PI * 2);
        }
    },
    {
        icon: Triangle,
        name: 'Triangle',
        render: (ctx, x, y, width, height) => {
            ctx.moveTo(x + width/2, y);
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x, y + height);
            ctx.closePath();
        }
    },
    {
        icon: Star,
        name: 'Star',
        render: (ctx, x, y, width, height) => {
            const spikes = 5;
            const outerRadius = width/2;
            const innerRadius = width/4;
            const centerX = x + width/2;
            const centerY = y + height/2;

            for(let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / spikes;
                const pointX = centerX + Math.cos(angle) * radius;
                const pointY = centerY + Math.sin(angle) * radius;

                i === 0 ? ctx.moveTo(pointX, pointY) : ctx.lineTo(pointX, pointY);
            }
            ctx.closePath();
        }
    },
    {
        icon: Ghost,
        name: 'Ghost',
        render: (ctx, x, y, width, height) => {
            ctx.arc(x + width/2, y + height/2, width/2, Math.PI, 0);
            ctx.lineTo(x + width, y + height);
            ctx.arc(x + width*0.75, y + height, width/4, 0, Math.PI);
            ctx.arc(x + width*0.25, y + height, width/4, 0, Math.PI);
            ctx.lineTo(x, y + height/2);
            ctx.closePath();
        }
    },
    {
        icon: Bird,
        name: 'Bird',
        render: (ctx, x, y, width, height) => {
            // Body
            ctx.ellipse(x + width/2, y + height/2, width/3, height/4, 0, 0, Math.PI * 2);

            // Head
            ctx.moveTo(x + width*0.7, y + height/2);
            ctx.arc(x + width*0.75, y + height/3, width/6, 0, Math.PI * 2);

            // Beak
            ctx.moveTo(x + width*0.85, y + height/3);
            ctx.lineTo(x + width*0.95, y + height/3);
            ctx.lineTo(x + width*0.85, y + height/2.8);
            ctx.closePath();

            // Wing
            ctx.moveTo(x + width/2, y + height/2);
            ctx.quadraticCurveTo(
                x + width/2, y + height/4,
                x + width*0.7, y + height/3
            );
        }
    },
    {
        icon: PiButterflyFill ,
        name: 'Butterfly',
        render: (ctx, x, y, width, height) => {
            // Left wing
            ctx.moveTo(x + width/2, y + height/2);
            ctx.bezierCurveTo(
                x + width*0.2, y + height*0.2,
                x + width*0.1, y + height*0.6,
                x + width/2, y + height/2
            );

            // Right wing
            ctx.moveTo(x + width/2, y + height/2);
            ctx.bezierCurveTo(
                x + width*0.8, y + height*0.2,
                x + width*0.9, y + height*0.6,
                x + width/2, y + height/2
            );

            // Body
            ctx.moveTo(x + width/2, y + height*0.2);
            ctx.lineTo(x + width/2, y + height*0.8);
        }
    },
    {
        icon: GiSeaDragon ,
        name: 'Dragon',
        render: (ctx, x, y, width, height) => {
            // Body
            ctx.moveTo(x + width*0.3, y + height/2);
            ctx.bezierCurveTo(
                x + width*0.4, y + height*0.3,
                x + width*0.6, y + height*0.3,
                x + width*0.7, y + height/2
            );

            // Head
            ctx.moveTo(x + width*0.7, y + height/2);
            ctx.arc(x + width*0.8, y + height*0.4, width*0.1, 0, Math.PI * 2);

            // Spikes
            for(let i = 0; i < 3; i++) {
                const spikeX = x + width*(0.4 + i*0.15);
                ctx.moveTo(spikeX, y + height*0.35);
                ctx.lineTo(spikeX, y + height*0.2);
            }

            // Tail
            ctx.moveTo(x + width*0.3, y + height/2);
            ctx.quadraticCurveTo(
                x + width*0.1, y + height*0.6,
                x + width*0.2, y + height*0.7
            );
        }
    },
    {
        icon: Heart,
        name: 'Heart',
        render: (ctx, x, y, width, height) => {
            const topCurveHeight = height * 0.3;
            ctx.moveTo(x + width/2, y + height);

            // Left curve
            ctx.bezierCurveTo(
                x, y + height*0.7,
                x, y + topCurveHeight,
                x + width/2, y + topCurveHeight
            );

            // Right curve
            ctx.bezierCurveTo(
                x + width, y + topCurveHeight,
                x + width, y + height*0.7,
                x + width/2, y + height
            );
        }
    },
    {
        icon: Flower,
        name: 'Flower',
        render: (ctx, x, y, width, height) => {
            const centerX = x + width/2;
            const centerY = y + height/2;
            const petalSize = width/4;

            // Draw 5 petals
            for(let i = 0; i < 5; i++) {
                const angle = (i * Math.PI * 2) / 5;
                const petalX = centerX + Math.cos(angle) * petalSize;
                const petalY = centerY + Math.sin(angle) * petalSize;

                ctx.moveTo(centerX, centerY);
                ctx.arc(petalX, petalY, petalSize, 0, Math.PI * 2);
            }

            // Center of flower
            ctx.moveTo(centerX + petalSize/2, centerY);
            ctx.arc(centerX, centerY, petalSize/2, 0, Math.PI * 2);
        }
    }
];

interface CharacterSelectProps {
    onSelect: (character: Character) => void;
}

export const CharacterSelect = ({ onSelect }: CharacterSelectProps) => {
    return (
        <div className="w-full max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8">Choose Your Character</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {CHARACTERS.map((character) => (
                    <button
                        key={character.name}
                        onClick={() => onSelect(character)}
                        className="p-6 border rounded-lg hover:bg-accent/50
                     flex flex-col items-center gap-2 transition-colors"
                    >
                        <character.icon size={40} />
                        <span className="font-medium">{character.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export { CHARACTERS };
