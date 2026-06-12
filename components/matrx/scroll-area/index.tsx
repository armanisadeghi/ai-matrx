// File Location: components/matrx/scroll-area/index.tsx

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MatrxScrollAreaProps {
    children: React.ReactNode;
    className?: string;
}

export const MatrxScrollArea: React.FC<MatrxScrollAreaProps> = ({ children, className }) => (
    <ScrollArea className={`h-[calc(100dvh-200px)] ${className}`}>
        {children}
    </ScrollArea>
);
