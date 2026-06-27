import React from 'react';
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle, ChevronUp, ChevronDown, Frown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { MatrxRecordId } from '@/types/records';
import { TailwindColor, COLOR_STYLES_DIRECT } from '@/constants/rich-text-constants';
import { ChipData } from '@/types/editor.types';
import { findChipsByBrokerIdGlobal } from '@/features/rich-text-editor/utils/chipFilnder';

interface BrokerRecord {
    name?: string;
    defaultComponent?: string;
    defaultSource?: string;
    isConnected?: boolean;
}

interface BrokerCardHeaderProps {
    recordId: MatrxRecordId;
    record: BrokerRecord;
    chips: ChipData[];
    color?: TailwindColor;
    isConnected?: boolean;
    isOpen: boolean;
    onToggle: () => void;
    onDelete: () => void;
}

const BrokerCardHeader: React.FC<BrokerCardHeaderProps> = ({ recordId, record, chips, color = 'blue', isConnected, isOpen, onToggle, onDelete }) => {
    const name = record?.name || 'Unnamed Broker';
    const hasChips = findChipsByBrokerIdGlobal(recordId).length > 0;

    const getStatusClasses = () => {
        return cn('h-6 w-6 flex items-center justify-center rounded-md relative', 'transition-all duration-300 ease-in-out');
    };

    const getColorBorderClasses = () => {
        const colorMap: Record<TailwindColor, string> = {
            red: 'border-l-red-500',
            orange: 'border-l-orange-500',
            amber: 'border-l-amber-500',
            yellow: 'border-l-yellow-500',
            lime: 'border-l-lime-500',
            green: 'border-l-green-500',
            emerald: 'border-l-emerald-500',
            teal: 'border-l-teal-500',
            cyan: 'border-l-cyan-500',
            sky: 'border-l-sky-500',
            blue: 'border-l-blue-500',
            indigo: 'border-l-indigo-500',
            violet: 'border-l-violet-500',
            purple: 'border-l-purple-500',
            fuchsia: 'border-l-fuchsia-500',
            pink: 'border-l-pink-500',
            rose: 'border-l-rose-500',
        };
        return colorMap[color] || colorMap.blue;
    };

    const isConnectedClass =
        'h-4 w-4 transition-all duration-300 text-emerald-600 dark:text-emerald-500 drop-shadow-[0_0_3px_rgba(16,185,129,0.3)] group-hover:drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]';
    const missingChipsClass =
        'h-4 w-4 transition-all duration-300 text-orange-600 dark:text-orange-500 drop-shadow-[0_0_3px_rgba(16,185,129,0.3)] group-hover:drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]';
    const isDisconnectedClass = 'h-4 w-4 text-muted-foreground transition-all duration-300';

    return (
        <div
            className={cn(
                'group flex items-center gap-1 p-1 cursor-pointer transition-all duration-200',
                'border-l-4 hover:bg-elevation3/50',
                getColorBorderClasses()
            )}
            onClick={onToggle}
        >
            <Button
                variant='ghost'
                size='icon'
                className='h-7 w-7 hover:bg-destructive/10 hover:text-destructive shrink-0'
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onDelete();
                }}
            >
                <X className='h-4 w-4' />
            </Button>
            <div
                className={getStatusClasses()}
                title={isConnected ? 'Connected' : 'Disconnected'}
            >
                {isConnected ? (
                    hasChips ? (
                        <CheckCircle2 className={isConnectedClass} />
                    ) : (
                        <Frown className={missingChipsClass} />
                    )
                ) : (
                    <XCircle className={isDisconnectedClass} />
                )}
            </div>

            <div className='flex items-center gap-1 min-w-0 flex-1'>
                <span className='font-medium text-sm truncate'>{name}</span>
            </div>

            <div className='flex items-center gap-2 flex-shrink-0'>{isOpen ? <ChevronUp className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}</div>
        </div>
    );
};

export default BrokerCardHeader;
