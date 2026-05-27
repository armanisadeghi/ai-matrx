// File location: @/app/tests/windows/hold-hold-page.tsx
'use client';

import WindowManager from "@/components/matrx/windows";

import RegisteredFunctionsList from "@/features/registered-function/components/RegisteredFunctionList";
import AiCockpitPage from '@/components/playground/AiCockpitPage';


import FunctionManagement from "@/features/registered-function/components/FunctionManagement";
import CameraPage from "@/components/matrx/camera";

const PlaygroundPage = () => {
    return (
        <div className="p-4">
            <AiCockpitPage />
        </div>
    );
}


export default function Page() {
    const windows = [
        { id: 1, title: 'Registered Function List', content: 'See all Functions in a list', CustomComponent: RegisteredFunctionsList },
        { id: 2, title: 'AI Playground', content: 'Test your best prompts and play with settings for AI Chat', CustomComponent: PlaygroundPage },
        { id: 3, title: 'Function Management', content: 'Manage Your Functions with full CRUD operations', CustomComponent: FunctionManagement },
        { id: 4, title: 'Camera page', content: 'Take Photos With Your Webcam', CustomComponent: CameraPage },
    ];

    return (
        <div className="app">
            <WindowManager windows={windows} />
        </div>
    );
}