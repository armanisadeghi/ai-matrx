// components/ControlPanel.tsx
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ControlPanelProps {
    onReset: () => void;
    onBack: () => void;
    onNext: () => void;
    started: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onReset, onBack, onNext, started }) => {
    return (
        <Card className="mt-4">
            <CardContent className="p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-8">
                            <Link href="/education/subjects/quick-math">All Lessons</Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={onReset} className="min-h-11 sm:min-h-8">Reset</Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onBack} className="min-h-11 sm:min-h-8">Back</Button>
                        <Button size="sm" onClick={onNext} className="min-h-11 sm:min-h-8">{!started ? 'Start Interactive' : 'Next'}</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ControlPanel;
