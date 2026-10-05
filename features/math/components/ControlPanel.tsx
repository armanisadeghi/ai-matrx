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
                        <Button asChild variant="outline">
                            <Link href="/education/subjects/quick-math">All Lessons</Link>
                        </Button>
                        <Button variant="outline" onClick={onReset}>Reset</Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onBack}>Back</Button>
                        <Button variant="primary" onClick={onNext}>{!started ? 'Start Interactive' : 'Next'}</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ControlPanel;
