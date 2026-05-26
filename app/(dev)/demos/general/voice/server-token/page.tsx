'use client';

import SimpleTtsPlayer from '@/components/audio/simple-tts/SimpleTtsPlayer';


const Page: React.FC = () => {
    return (
        <div className="h-full w-full">
            <h1 className="text-2xl font-bold mb-4">Simple TTS Player</h1>

            <SimpleTtsPlayer />

        </div>
    );
};

export default Page;
