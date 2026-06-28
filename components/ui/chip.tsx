import React, {useState} from 'react';
import {X, Star, Heart, Flame, Gem, Zap, Award, Crown, Diamond, Shield} from 'lucide-react';
import { MatrxVariant } from "./types";
import { cn } from '@/utils/cn';

type ChipVariants = MatrxVariant | 'warning' | 'danger' | 'purple' | 'pink' | 'indigo' | 'teal' | 'orange'  | string;

type ChipProps = {
    children: React.ReactNode;
    variant?: ChipVariants;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | string;
    onRemove?: (() => void) | null;
    gradient?: boolean;
};

type EnhancedChipProps = {
    children: React.ReactNode;
    variant?: ChipVariants;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | string;
    onRemove?: (() => void) | null;
    gradient?: boolean;
    icon?: React.ComponentType<any>;
    animated?: boolean;
    glow?: boolean;
};

export const Chip = (
    {
        children,
        variant = 'default',
        size = 'md',
        onRemove = null,
        gradient = false,
    }: ChipProps) => {
    const baseStyles = "inline-flex items-center rounded-full font-medium transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transform hover:-translate-y-0.5 shadow-lg active:translate-y-0";

    const variants = {
        default: "bg-background text-foreground border-border",
        primary: "bg-primary text-primary-foreground border-primary-foreground/20",
        secondary: "bg-secondary text-secondary-foreground border-secondary-foreground/20",
        destructive: "bg-destructive text-destructive-foreground border-destructive-foreground/20",
        success: "bg-green-500 dark:bg-green-600 text-white border-green-700 dark:border-green-800",
        outline: "border-2 border-border bg-background text-foreground",
        ghost: "bg-background/50 text-foreground hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
        // Extended variants
        warning: "bg-yellow-500 dark:bg-yellow-600 text-white border-yellow-700 dark:border-yellow-800",
        info: "bg-blue-500 dark:bg-blue-600 text-white border-blue-700 dark:border-blue-800",
        purple: "bg-purple-500 dark:bg-purple-600 text-white border-purple-700 dark:border-purple-800",
        pink: "bg-pink-500 dark:bg-pink-600 text-white border-pink-700 dark:border-pink-800",
        indigo: "bg-indigo-500 dark:bg-indigo-600 text-white border-indigo-700 dark:border-indigo-800",
        teal: "bg-teal-500 dark:bg-teal-600 text-white border-teal-700 dark:border-teal-800",
        orange: "bg-orange-500 dark:bg-orange-600 text-white border-orange-700 dark:border-orange-800"
    };

    const gradientVariants = {
        default: "bg-gradient-to-r from-background via-muted to-background text-foreground",
        primary: "bg-gradient-to-r from-primary via-primary/80 to-primary text-primary-foreground",
        secondary: "bg-gradient-to-r from-secondary via-secondary/80 to-secondary text-secondary-foreground",
        destructive: "bg-gradient-to-r from-destructive via-destructive/80 to-destructive text-destructive-foreground",
        success: "bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-white",
        outline: "bg-gradient-to-r from-background via-muted to-background text-foreground border-2",
        ghost: "bg-gradient-to-r from-background/50 via-muted/50 to-background/50 text-foreground",
        link: "bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 text-primary",
        // Extended gradient variants
        warning: "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white",
        info: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-white",
        purple: "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 text-white",
        pink: "bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 text-white",
        indigo: "bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600 text-white",
        teal: "bg-gradient-to-r from-teal-400 via-teal-500 to-teal-600 text-white",
        orange: "bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white"
    };

    const sizes = {
        xs: "px-1.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-sm",
        default: "px-3 py-1 text-base",
        md: "px-3 py-1 text-base",
        lg: "px-4 py-2 text-lg",
        xl: "px-5 py-2.5 text-xl",
        "2xl": "px-6 py-3 text-2xl",
        "3xl": "px-7 py-3.5 text-3xl"
    };

    return (
        <span className={`
      ${baseStyles} 
      ${gradient ? gradientVariants[variant] : variants[variant]} 
      ${sizes[size]}
      ${gradient ? 'border-none' : ''}
    `}>
      {children}
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="ml-2 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20"
                >
                    <svg
                        className="h-3 w-3"
                        fill="none"
                        strokeWidth="2"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            )}
    </span>
    );
};


export const EnhancedChip = ({
                                 children,
                                 variant = 'default',
                                 size = 'md',
                                 onRemove = null,
                                 gradient = false,
                                 icon: IconComponent,
                                 animated = false,
                                 glow = false,
                             }: EnhancedChipProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isRemoved, setIsRemoved] = useState(false);

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRemoved(true);
        setTimeout(() => {
            if (onRemove) onRemove();
        }, 300);
    };

    const baseStyles = cn(
        "inline-flex items-center rounded-full font-medium transition-all duration-300 cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
        animated && "animate-slowPulse",
        isRemoved ? "opacity-0 scale-75" : "opacity-100 scale-100",
        isHovered ? "-translate-y-1 rotate-1" : "translate-y-0 rotate-0"
    );

    const variants = {
        default: "bg-background text-foreground border-b-4 border-border shadow-lg hover:shadow-xl shadow-background/50 dark:shadow-background/20",
        primary: "bg-primary text-primary-foreground border-b-4 border-primary-foreground/20 shadow-lg hover:shadow-xl shadow-primary/50",
        secondary: "bg-secondary text-secondary-foreground border-b-4 border-secondary-foreground/20 shadow-lg hover:shadow-xl shadow-secondary/50",
        destructive: "bg-destructive text-destructive-foreground border-b-4 border-destructive-foreground/20 shadow-lg hover:shadow-xl shadow-destructive/50",
        success: "bg-green-500 dark:bg-green-600 text-white border-b-4 border-green-700 dark:border-green-800 shadow-lg hover:shadow-xl shadow-green-500/50",
        outline: "bg-background text-foreground border-2 border-border shadow-lg hover:shadow-xl",
        ghost: "bg-background/50 text-foreground hover:bg-muted border-b-4 border-border/20",
        link: "text-primary underline-offset-4 hover:underline",
        warning: "bg-yellow-500 dark:bg-yellow-600 text-white border-b-4 border-yellow-700 dark:border-yellow-800 shadow-lg hover:shadow-xl shadow-yellow-500/50",
        info: "bg-blue-500 dark:bg-blue-600 text-white border-b-4 border-blue-700 dark:border-blue-800 shadow-lg hover:shadow-xl shadow-blue-500/50",
        purple: "bg-purple-500 dark:bg-purple-600 text-white border-b-4 border-purple-700 dark:border-purple-800 shadow-lg hover:shadow-xl shadow-purple-500/50",
        pink: "bg-pink-500 dark:bg-pink-600 text-white border-b-4 border-pink-700 dark:border-pink-800 shadow-lg hover:shadow-xl shadow-pink-500/50",
        indigo: "bg-indigo-500 dark:bg-indigo-600 text-white border-b-4 border-indigo-700 dark:border-indigo-800 shadow-lg hover:shadow-xl shadow-indigo-500/50",
        teal: "bg-teal-500 dark:bg-teal-600 text-white border-b-4 border-teal-700 dark:border-teal-800 shadow-lg hover:shadow-xl shadow-teal-500/50",
        orange: "bg-orange-500 dark:bg-orange-600 text-white border-b-4 border-orange-700 dark:border-orange-800 shadow-lg hover:shadow-xl shadow-orange-500/50"
    };

    const gradientVariants = {
        default: "bg-gradient-to-r from-background via-muted to-background text-foreground",
        primary: "bg-gradient-to-r from-primary via-primary/80 to-primary text-primary-foreground",
        secondary: "bg-gradient-to-r from-secondary via-secondary/80 to-secondary text-secondary-foreground",
        destructive: "bg-gradient-to-r from-destructive via-destructive/80 to-destructive text-destructive-foreground",
        success: "bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-white",
        outline: "bg-gradient-to-r from-background via-muted to-background text-foreground border-2",
        ghost: "bg-gradient-to-r from-background/50 via-muted/50 to-background/50 text-foreground",
        link: "bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 text-primary",
        warning: "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white",
        info: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-white",
        purple: "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 text-white",
        pink: "bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 text-white",
        indigo: "bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600 text-white",
        teal: "bg-gradient-to-r from-teal-400 via-teal-500 to-teal-600 text-white",
        orange: "bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white"
    };

    const getGlowStyle = (variant: ChipVariants) => {
        if (!glow) return {};

        const glowColors = {
            default: 'var(--foreground)',
            primary: 'var(--primary)',
            secondary: 'var(--secondary)',
            destructive: 'var(--destructive)',
            success: 'rgb(34 197 94)',
            outline: 'var(--border)',
            ghost: 'var(--muted)',
            link: 'var(--primary)',
            warning: 'rgb(234 179 8)',
            info: 'rgb(59 130 246)',
            purple: 'rgb(168 85 247)',
            pink: 'rgb(236 72 153)',
            indigo: 'rgb(99 102 241)',
            teal: 'rgb(20 184 166)',
            orange: 'rgb(249 115 22)'
        };

        const glowIntensity = {
            default: '0.2',
            primary: '0.5',
            secondary: '0.4',
            destructive: '0.5',
            success: '0.5',
            outline: '0.3',
            ghost: '0.2',
            link: '0.4',
            warning: '0.5',
            info: '0.5',
            purple: '0.5',
            pink: '0.5',
            indigo: '0.5',
            teal: '0.5',
            orange: '0.5'
        };

        const color = glowColors[variant];
        return {
            filter: `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 12px ${color})`,
            '--glow-intensity': glowIntensity[variant],
            '--glow-color': color
        };
    };

    const sizes = {
        xs: "px-1.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-sm",
        default: "px-3 py-1 text-base",
        md: "px-3 py-1 text-base",
        lg: "px-4 py-2 text-lg",
        xl: "px-5 py-2.5 text-xl",
        "2xl": "px-6 py-3 text-2xl",
        "3xl": "px-7 py-3.5 text-3xl"
    };

    const iconSizes = {
        xs: 12,
        sm: 14,
        default: 16,
        md: 16,
        lg: 20,
        xl: 24,
        "2xl": 28,
        "3xl": 32
    };

    return (
        <span
            className={cn(
                baseStyles,
                gradient ? gradientVariants[variant] : variants[variant],
                sizes[size],
                gradient && 'border-none',
                glow && 'animate-glow',
                'transition-all duration-300'
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                ...getGlowStyle(variant as ChipVariants),
                transform: `${isHovered ? 'translateY(-2px) rotate(1deg)' : 'translateY(0) rotate(0)'}`,
            }}
        >
            {IconComponent && (
                <span className="mr-1">
                    <IconComponent size={iconSizes[size]} />
                </span>
            )}
            {children}
            {onRemove && (
                <button
                    onClick={handleRemove}
                    className="ml-2 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                    <X size={iconSizes[size]} />
                </button>
            )}
        </span>
    );
};


const EnhancedChipExamples = () => {
    const [chips, setChips] = useState([
        {id: 1, label: 'Removable', variant: 'default'},
        {id: 2, label: 'Awesome', variant: 'primary'},
        {id: 3, label: 'Beautiful', variant: 'success'}
    ]);

    const handleRemove = (id) => {
        setChips(chips.filter(chip => chip.id !== id));
    };

    return (
        <div className="space-y-8 p-4">
            <div>
                <h3 className="text-lg font-semibold mb-2">3D Chips with Icons</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip icon={Star}>Default</EnhancedChip>
                    <EnhancedChip variant="primary" icon={Heart}>Primary</EnhancedChip>
                    <EnhancedChip variant="success" icon={Gem}>Success</EnhancedChip>
                    <EnhancedChip variant="warning" icon={Flame}>Warning</EnhancedChip>
                    <EnhancedChip variant="danger" icon={Zap}>Danger</EnhancedChip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Animated Gradient Chips</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" gradient animated icon={Crown}>Animated</EnhancedChip>
                    <EnhancedChip variant="purple" gradient animated icon={Diamond}>Purple</EnhancedChip>
                    <EnhancedChip variant="teal" gradient animated icon={Shield}>Teal</EnhancedChip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Glowing Effects</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" glow>Glowing</EnhancedChip>
                    <EnhancedChip variant="success" glow gradient>Success</EnhancedChip>
                    <EnhancedChip variant="warning" glow icon={Flame}>Warning</EnhancedChip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Working Remove Function</h3>
                <div className="flex flex-wrap gap-2">
                    {chips.map(chip => (
                        <EnhancedChip
                            key={chip.id}
                            variant={chip.variant}
                            onRemove={() => handleRemove(chip.id)}
                            icon={Star}
                        >
                            {chip.label}
                        </EnhancedChip>
                    ))}
                </div>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Basic Variants</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip icon={Star}>Default</EnhancedChip>
                    <EnhancedChip variant="primary" icon={Heart}>Primary</EnhancedChip>
                    <EnhancedChip variant="secondary" icon={Shield}>Secondary</EnhancedChip>
                    <EnhancedChip variant="destructive" icon={X}>Destructive</EnhancedChip>
                </div>
            </div>

            {/* Glowing Effects */}
            <div>
                <h3 className="text-lg font-semibold mb-2">Glowing Effects</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" glow>Glow Primary</EnhancedChip>
                    <EnhancedChip variant="success" glow>Glow Success</EnhancedChip>
                    <EnhancedChip variant="purple" glow>Glow Purple</EnhancedChip>
                    <EnhancedChip variant="warning" glow icon={Flame}>Glow Warning</EnhancedChip>
                </div>
            </div>

            {/* Animated Variants */}
            <div>
                <h3 className="text-lg font-semibold mb-2">Animated</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" animated>Animated Primary</EnhancedChip>
                    <EnhancedChip variant="success" animated icon={Gem}>Animated Success</EnhancedChip>
                    <EnhancedChip variant="warning" animated icon={Flame}>Animated Warning</EnhancedChip>
                </div>
            </div>

            {/* Gradient Variants */}
            <div>
                <h3 className="text-lg font-semibold mb-2">Gradients</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" gradient>Gradient Primary</EnhancedChip>
                    <EnhancedChip variant="purple" gradient icon={Crown}>Gradient Purple</EnhancedChip>
                    <EnhancedChip variant="teal" gradient icon={Diamond}>Gradient Teal</EnhancedChip>
                </div>
            </div>

            {/* Combined Effects */}
            <div>
                <h3 className="text-lg font-semibold mb-2">Combined Effects</h3>
                <div className="flex flex-wrap gap-2">
                    <EnhancedChip variant="primary" gradient animated glow icon={Star}>
                        All Effects
                    </EnhancedChip>
                    <EnhancedChip variant="success" gradient glow icon={Shield}>
                        Gradient + Glow
                    </EnhancedChip>
                    <EnhancedChip variant="warning" animated glow icon={Flame}>
                        Animated + Glow
                    </EnhancedChip>
                </div>
            </div>

            {/* Size Variants */}
            <div>
                <h3 className="text-lg font-semibold mb-2">Sizes</h3>
                <div className="flex flex-wrap gap-2 items-center">
                    <EnhancedChip size="xs" icon={Star}>Extra Small</EnhancedChip>
                    <EnhancedChip size="sm" icon={Star}>Small</EnhancedChip>
                    <EnhancedChip size="md" icon={Star}>Medium</EnhancedChip>
                    <EnhancedChip size="lg" icon={Star}>Large</EnhancedChip>
                    <EnhancedChip size="xl" icon={Star}>Extra Large</EnhancedChip>
                    <EnhancedChip size="2xl" icon={Star}>2X Large</EnhancedChip>
                    <EnhancedChip size="3xl" icon={Star}>3X Large</EnhancedChip>
                </div>
            </div>

        </div>
    );
};


const ChipExamples = () => {
    return (
        <div className="space-y-8 p-4">
            <div>
                <h3 className="text-lg font-semibold mb-2">3D Chips</h3>
                <div className="flex flex-wrap gap-2">
                    <Chip>Default</Chip>
                    <Chip variant="primary">Primary</Chip>
                    <Chip variant="success">Success</Chip>
                    <Chip variant="warning">Warning</Chip>
                    <Chip variant="danger">Danger</Chip>
                    <Chip variant="purple">Purple</Chip>
                    <Chip variant="pink">Pink</Chip>
                    <Chip variant="indigo">Indigo</Chip>
                    <Chip variant="teal">Teal</Chip>
                    <Chip variant="orange">Orange</Chip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Gradient Chips</h3>
                <div className="flex flex-wrap gap-2">
                    <Chip gradient>Default</Chip>
                    <Chip variant="primary" gradient>Primary</Chip>
                    <Chip variant="success" gradient>Success</Chip>
                    <Chip variant="warning" gradient>Warning</Chip>
                    <Chip variant="danger" gradient>Danger</Chip>
                    <Chip variant="purple" gradient>Purple</Chip>
                    <Chip variant="pink" gradient>Pink</Chip>
                    <Chip variant="indigo" gradient>Indigo</Chip>
                    <Chip variant="teal" gradient>Teal</Chip>
                    <Chip variant="orange" gradient>Orange</Chip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Sizes</h3>
                <div className="flex flex-wrap gap-2 items-center">
                    <Chip size="sm">Small</Chip>
                    <Chip size="md">Medium</Chip>
                    <Chip size="lg">Large</Chip>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Removable</h3>
                <div className="flex flex-wrap gap-2">
                    <Chip onRemove={() => console.log('removed')}>Removable</Chip>
                    <Chip variant="primary" gradient onRemove={() => console.log('removed')}>
                        Remove Me
                    </Chip>
                </div>
            </div>
        </div>
    );
};

