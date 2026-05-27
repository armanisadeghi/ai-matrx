'use client';
import { useState } from 'react';


// ChatGPT: https://chatgpt.com/c/66f4a3ad-b920-8012-a214-16ce35644391

export default function FullScreenComponent() {
    const [isFullScreen, setIsFullScreen] = useState(false);

    // Function to request full-screen mode
    const requestFullScreen = async () => {
        const elem = document.documentElement; // Get the whole page

        if (elem.requestFullscreen) {
            try {
                await elem.requestFullscreen();
                setIsFullScreen(true); // Only set state after successful fullscreen request
            } catch (error) {
                console.error('Failed to enter full-screen mode:', error);
            }
        }
    };

    // Function to exit full-screen mode
    const exitFullScreen = async () => {
        if (document.exitFullscreen) {
            try {
                await document.exitFullscreen();
                setIsFullScreen(false); // Only set state after successfully exiting fullscreen
            } catch (error) {
                console.error('Failed to exit full-screen mode:', error);
            }
        }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100">
            <button
                className="px-4 py-2 bg-blue-500 text-white rounded-md"
                onClick={isFullScreen ? exitFullScreen : requestFullScreen}
            >
                {isFullScreen ? 'Exit Full Screen' : 'Go Full Screen'}
            </button>
        </div>
    );
}
