'use client';

// hooks/useGameSettings.ts
import { useState, useEffect } from 'react';

export interface GameConfiguration {
    // Canvas and Entity Dimensions
    canvasWidth: number;
    canvasHeight: number;
    playerSize: number;
    platformWidth: number;
    platformHeight: number;
    coinSize: number;
    enemySize: number;

    // Movement and Physics
    enemySpeed: number;
    jumpForce: number;
    gravity: number;
    playerSpeed: number;

    // Scroll Mechanics
    topZoneThreshold: number;
    baseScrollSpeed: number;
    maxScrollSpeed: number;
    scrollAcceleration: number;

    // Scoring and Spawning
    coinCollectScore: number;
    enemyDefeatScore: number;
    initialEnemySpawnDelay: number;
    minEnemyCount: number;
    maxEnemyCount: number;
    enemySpawnHeightBuffer: number;
}

export const DEFAULT_SETTINGS: GameConfiguration = {
    canvasWidth: 400,
    canvasHeight: 800,
    playerSize: 30,
    platformWidth: 75,
    platformHeight: 10,
    coinSize: 20,
    enemySize: 20,
    enemySpeed: 0.8,
    jumpForce: -11,
    gravity: 0.3,
    playerSpeed: 3,
    topZoneThreshold: 0.6,
    baseScrollSpeed: 0.5,
    maxScrollSpeed: 15,
    scrollAcceleration: 0.8,
    coinCollectScore: 50,
    enemyDefeatScore: 200,
    initialEnemySpawnDelay: 5000,
    minEnemyCount: 1,
    maxEnemyCount: 3,
    enemySpawnHeightBuffer: 100,
};

export const useGameSettings = () => {
    const [settings, setSettings] = useState<GameConfiguration>(DEFAULT_SETTINGS);

    useEffect(() => {
        const savedSettings = localStorage.getItem('gameSettings');
        if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
        }
    }, []);

    const updateSettings = (newSettings: Partial<GameConfiguration>) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            localStorage.setItem('gameSettings', JSON.stringify(updated));
            return updated;
        });
    };

    const resetSettings = () => {
        localStorage.removeItem('gameSettings');
        setSettings(DEFAULT_SETTINGS);
    };

    return { settings, updateSettings, resetSettings };
};
