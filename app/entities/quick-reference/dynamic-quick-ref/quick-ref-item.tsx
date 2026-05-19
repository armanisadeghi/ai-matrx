'use client';

import {memo} from 'react';
import {cn} from '@/lib/utils';
import {Card, CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Grid2X2, ChevronRight, Star, Zap, BookOpen, Mail, User, StarIcon, FileText, Hash, Brain, MessageCircle, Boxes, Briefcase, VariableIcon, SquareFunction } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { TbBasketDiscount } from 'react-icons/tb';
import { HashCircle } from '@mynaui/icons-react';

interface QuickRefProps {
    displayValue: string;
    isSelected: boolean;
    entityKey?: string;
}

// Simple minimal version
const SimpleQuickRefItem = memo(function SimpleQuickRefItem(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div
            className={cn(
                'px-2 py-1.5 cursor-pointer rounded-sm transition-colors',
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
        >
            <span className="text-sm truncate block">
                {displayValue}
            </span>
        </div>
    );
});

const originalQuickRefCard = memo(function originalQuickRefCard(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <Card
            className={cn(
                'relative cursor-pointer p-0',
                isSelected ? 'border border-primary bg-accent' : 'hover:bg-accent/50'
            )}
        >
            <CardContent className="p-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Grid2X2 className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
                    <div className="font-medium text-foreground truncate text-sm">
                        {displayValue}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});


// Card with icon
const IconQuickRefCard = memo(function IconQuickRefCard(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <Card
            className={cn(
                'relative cursor-pointer p-0 transition-all',
                isSelected ? 'border-primary bg-accent shadow-md' : 'hover:bg-accent/50 hover:shadow-sm'
            )}
        >
            <CardContent className="p-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Grid2X2 className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
                    <div className="font-medium text-foreground truncate text-sm">
                        {displayValue}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});

// Professional compact badge
const CompactBadgeRef = memo(function CompactBadgeRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
            "bg-background border shadow-sm cursor-pointer",
            isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"
        )}>
            <User className="h-3 w-3 text-muted-foreground"/>
            <span className="truncate">{displayValue}</span>
        </div>
    );
});


const ENTITY_ICON_LOOKUP = {
    'recipe': Brain,
    'conversation': MessageCircle,
    'message': MessageCircle,
    'applet': Boxes,
    'task': TbBasketDiscount,
    'project': Briefcase,
    'user': User,
    'registeredFunction': SquareFunction,
    'arg': HashCircle,
    'dataBroker': VariableIcon
};

const GradientQuickRef = memo(function GradientQuickRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    const StarComponent = entityKey && ENTITY_ICON_LOOKUP[entityKey] 
        ? ENTITY_ICON_LOOKUP[entityKey] 
        : Star;
    const IconComponent = isSelected ? ChevronRight : StarComponent;

    return (
        <div className={cn(
            "cursor-pointer rounded-lg p-3 transition-all",
            "bg-gradient-to-r from-primary/5 to-primary/10",
            "border border-border",
            isSelected ?
                "from-primary/20 to-primary/30 shadow-md border-primary" :
                "hover:shadow-sm hover:from-primary/10 hover:to-primary/20"
        )}>
            <div className="flex items-center gap-2">
                <IconComponent className="h-4 w-4 text-primary"/>
                <span className="text-sm truncate">{displayValue}</span>
            </div>
        </div>
    );
});

const GradientQuickRefTwoLine = memo(function GradientQuickRefTwoLine(
    {
        displayValue,
        secondaryText,
        isSelected,
        entityKey
    }: QuickRefProps & { secondaryText?: string }) {
    const StarComponent = entityKey && ENTITY_ICON_LOOKUP[entityKey] 
        ? ENTITY_ICON_LOOKUP[entityKey] 
        : Star;
    const IconComponent = isSelected ? ChevronRight : StarComponent;
    
    return (
        <div className={cn(
            "cursor-pointer rounded-lg p-3 transition-all",
            "bg-gradient-to-r from-primary/5 to-primary/10",
            "border border-border",
            isSelected ?
                "from-primary/20 to-primary/30 shadow-md border-primary" :
                "hover:shadow-sm hover:from-primary/10 hover:to-primary/20"
        )}>
            <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                    <IconComponent className="h-4 w-4 text-primary"/>
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{displayValue}</span>
                    {secondaryText && (
                        <span className="text-xs text-muted-foreground truncate mt-0.5">{secondaryText}</span>
                    )}
                </div>
            </div>
        </div>
    );
});


// Fun bubble style for kid-friendly UI
const BubbleQuickRef = memo(function BubbleQuickRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div className="relative p-1">
            <div className={cn(
                "rounded-full px-4 py-2 cursor-pointer transition-all",
                "border-2 flex items-center gap-2",
                "hover:scale-105 hover:z-10",
                isSelected ?
                    "bg-pink-100 border-pink-400 dark:bg-pink-950 dark:border-pink-700" :
                    "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-800"
            )}>
                <Zap className={cn(
                    "h-4 w-4",
                    isSelected ? "text-pink-500 dark:text-pink-400" : "text-blue-400 dark:text-blue-300"
                )}/>
                <span className={cn(
                    "text-sm font-medium truncate",
                    isSelected ? "text-pink-700 dark:text-pink-300" : "text-blue-600 dark:text-blue-300"
                )}>
                    {displayValue}
                </span>
            </div>
        </div>
    );
});


// Email-style preview
const EmailPreviewRef = memo(function EmailPreviewRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div className={cn(
            "p-2.5 cursor-pointer rounded-md transition-all",
            "border-l-4",
            isSelected ?
                "bg-accent border-l-primary" :
                "border-l-transparent hover:bg-accent/50 hover:border-l-primary/50"
        )}>
            <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground"/>
                <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">
                        {displayValue}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                        Quick reference item
                    </div>
                </div>
            </div>
        </div>
    );
});

// Professional pill badge
const PillBadgeRef = memo(function PillBadgeRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <Badge variant={isSelected ? "default" : "secondary"}
               className={cn(
                   "cursor-pointer transition-all hover:opacity-80",
                   "px-3 py-1 h-auto",
                   isSelected ? "shadow-sm" : ""
               )}>
            {displayValue}
        </Badge>
    );
});

// Minimalist outline style
const OutlineQuickRef = memo(function OutlineQuickRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div className={cn(
            "px-3 py-1.5 rounded-md cursor-pointer transition-all",
            "border text-sm",
            isSelected ?
                "border-primary bg-primary/5 text-primary" :
                "border-border hover:border-primary/50 hover:bg-accent/50"
        )}>
            <span className="truncate block">{displayValue}</span>
        </div>
    );
});

// Book reference style
const BookReferenceItem = memo(function BookReferenceItem(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <div className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer transition-all rounded-md",
            "border-l-4",
            isSelected ?
                "bg-accent/80 border-l-primary" :
                "hover:bg-accent/40 border-l-muted"
        )}>
            <BookOpen className="h-4 w-4 text-muted-foreground"/>
            <div className="font-serif text-sm truncate italic">
                {displayValue}
            </div>
        </div>
    );
});

const LargeCardRef = memo(function LargeCardRef(
    {
        displayValue,
        isSelected,
        entityKey
    }: QuickRefProps) {
    return (
        <Card className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            "group relative overflow-hidden",
            isSelected ? "border-primary bg-accent" : "hover:bg-accent/50"
        )}>
            <CardContent className="p-6 flex flex-col items-center gap-4">
                <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    "bg-primary/10 text-primary transition-all",
                    "group-hover:scale-110"
                )}>
                    <Grid2X2 className="h-6 w-6"/>
                </div>
                <h3 className={cn(
                    "text-lg font-semibold text-center break-words max-w-[200px]",
                    "transition-colors",
                    isSelected ? "text-primary" : "text-foreground"
                )}>
                    {displayValue}
                </h3>
            </CardContent>
            {isSelected && (
                <div className="absolute inset-0 border-2 border-primary rounded-lg"/>
            )}
        </Card>
    );
});

// UUID detection and formatting
const isUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
};

const formatUUID = (uuid: string): string => {
    return `...${uuid.slice(-5)}`;
};

const DynamicIconRef = memo(function DynamicIconRef({
    displayValue,
    isSelected,
    entityKey
}: QuickRefProps) {
    const isUuidValue = isUUID(displayValue);

    const cardContent = (
        <Card
            className={cn(
                'relative cursor-pointer p-0 transition-all',
                isSelected ? 'border-primary bg-accent shadow-md' : 'hover:bg-accent/50 hover:shadow-sm'
            )}
        >
            <CardContent className="p-2">
                <div className="flex items-center gap-2 min-w-0">
                    {isUuidValue ? (
                        <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
                    ) : (
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0">
                        <div className="font-medium text-foreground truncate text-sm">
                            {isUuidValue ? formatUUID(displayValue) : displayValue}
                        </div>
                        {isUuidValue && (
                            <Badge
                                variant="secondary"
                                className="h-4 px-1 text-[10px] font-normal"
                            >
                                UUID
                            </Badge>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (!isUuidValue) {
        return cardContent;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    {cardContent}
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs font-mono">{displayValue}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

export const QUICK_REF_VARIANTS = {
    simple: SimpleQuickRefItem,
    original: originalQuickRefCard,
    icon: IconQuickRefCard,
    compact: CompactBadgeRef,
    gradient: GradientQuickRef,
    twoLine: GradientQuickRefTwoLine,
    bubble: BubbleQuickRef,
    email: EmailPreviewRef,
    pill: PillBadgeRef,
    outline: OutlineQuickRef,
    book: BookReferenceItem,
    large: LargeCardRef,
    dynamic: DynamicIconRef,
} as const;

export type QuickRefVariant = keyof typeof QUICK_REF_VARIANTS;

