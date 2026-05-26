'use client';

import TtsPlayerWithControls from '@/components/audio/simple-tts/TtsPlayerWithControls';


const Page: React.FC = () => {
    return (
        <div className="h-full w-full">
            <h1 className="p-4 text-2xl font-bold mb-4">TTS with Controls</h1>

            <TtsPlayerWithControls />

        </div>
    );
};

export default Page;
