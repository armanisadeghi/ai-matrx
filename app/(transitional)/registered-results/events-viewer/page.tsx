'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import EventsViewer from '@/features/workflows/results/registered-components/EventsViewer';

export default function Page() {
    const router = useRouter();
    const brokerId = 'EVENT_LIST_DATA';
    
    const handleBack = () => {
        router.back();
    };

    return (
        <div className="relative">
            {/* Back Button */}
            <div className="fixed top-4 left-4 z-50">
                <Button 
                    onClick={handleBack}
                    variant="outline"
                    size="sm"
                    className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300 dark:border-gray-600 shadow-lg hover:bg-white dark:hover:bg-gray-800"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
            </div>
            
            <EventsViewer nodeData={null} brokerId={brokerId}/>
        </div>
    );
}

