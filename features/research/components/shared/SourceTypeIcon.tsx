'use client';

import { Globe, Play, FileText, File, Pencil, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceType } from '../../types';

const ICON_MAP: Record<SourceType, typeof Globe> = {
    web: Globe,
    youtube: Play,
    pdf: FileText,
    file: File,
    manual: Pencil,
    social: AtSign,
};

interface SourceTypeIconProps {
    type: SourceType;
    className?: string;
    size?: number;
}

export function SourceTypeIcon({ type, className, size = 16 }: SourceTypeIconProps) {
    const Icon = ICON_MAP[type] ?? Globe;
    return <Icon className={cn('shrink-0', className)} size={size} />;
}
