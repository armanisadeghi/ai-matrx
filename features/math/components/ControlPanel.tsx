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
                <div className="flex justify-between items-center">
                    <div>
                        <Link href="/education/subjects/quick-math">
                            <Button variant="outline" size="sm" className="mr-2">All Lessons</Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>
                    </div>
                    <div>
                        <Button variant="outline" size="sm" onClick={onBack} className="mr-2">Back</Button>
                        <Button size="sm" onClick={onNext}>{!started ? 'Start Interactive' : 'Next'}</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ControlPanel;
