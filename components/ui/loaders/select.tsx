'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, Loader2, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'destructive' | 'success' | 'outline' | 'secondary' | 'ghost' | 'link' | 'primary';
type ComponentSize = 'default' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'icon' | 'roundIcon';

const sizeToHeightMap: Record<ComponentSize, string> = {
    'xs': 'h-7',
    'sm': 'h-8',
    'default': 'h-9',
    'md': 'h-10',
    'lg': 'h-11',
    'xl': 'h-12',
    '2xl': 'h-14',
    '3xl': 'h-16',
    'icon': 'h-8 w-8',
    'roundIcon': 'h-8 w-8'
};

const sizeToTextMap: Record<ComponentSize, string> = {
    'xs': 'text-xs',
    'sm': 'text-sm',
    'default': 'text-base',
    'md': 'text-base',
    'lg': 'text-lg',
    'xl': 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    'icon': 'text-base',
    'roundIcon': 'text-base'
};

const sizeToIconMap: Record<ComponentSize, number> = {
    'xs': 12,
    'sm': 14,
    'default': 16,
    'md': 18,
    'lg': 20,
    'xl': 22,
    '2xl': 24,
    '3xl': 28,
    'icon': 16,
    'roundIcon': 16
};

export type SelectProps = {
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    isLoading?: boolean;
    disabled?: boolean;
    error?: boolean;
    size?: ComponentSize;
    variant?: ButtonVariant;
    className?: string;
    triggerClassName?: string;
    label?: string;
    description?: string;
    icon?: LucideIcon;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
    ({
         options,
         value,
         onChange,
         placeholder = 'Select option',
         isLoading = false,
         disabled = false,
         error = false,
         size = 'default',
         variant = 'default',
         className,
         triggerClassName,
         label,
         description,
         icon: Icon,
         onClick,
         ...props
     }, ref) => {
        const isIconVariant = size === 'icon' || size === 'roundIcon';
        const isRoundIcon = size === 'roundIcon';
        const iconSize = sizeToIconMap[size];
        const selectedOption = options.find(opt => opt.value === value);

        return (
            <div className={cn('grid gap-1.5 relative', className)}>
                {label && !isIconVariant && (
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {label}
                    </label>
                )}
                <SelectPrimitive.Root value={value} onValueChange={onChange}>
                    <div className="relative"> {/* Added wrapper div for badge positioning */}
                        <SelectPrimitive.Trigger
                            ref={ref}
                            onClick={onClick}
                            className={cn(
                                'flex items-center border transition-colors',
                                'ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                                'disabled:cursor-not-allowed disabled:opacity-50',
                                {
                                    'p-2 justify-center': isIconVariant,
                                    'px-3 justify-between': !isIconVariant,
                                    'rounded-full': isRoundIcon,
                                    'rounded-md': !isRoundIcon,
                                    'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
                                    'bg-success text-success-foreground hover:bg-success/90': variant === 'success',
                                    'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
                                    'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
                                    'border-input bg-background hover:bg-accent hover:text-accent-foreground': variant === 'outline',
                                    'border-none shadow-none hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
                                    'w-8': isIconVariant,
                                    'w-full': !isIconVariant,
                                },
                                !isIconVariant && sizeToHeightMap[size],
                                sizeToTextMap[size],
                                error && 'border-destructive',
                                triggerClassName
                            )}
                            disabled={disabled || isLoading}
                        >
                            {isIconVariant ? (
                                <div className="flex items-center justify-center">
                                    {Icon && <Icon size={iconSize} />}
                                </div>
                            ) : (
                                 <>
                                     <div className="flex items-center gap-2 min-w-0 flex-1">
                                         {Icon && <Icon size={iconSize} className="shrink-0" />}
                                         <SelectPrimitive.Value
                                             placeholder={placeholder}
                                             className="truncate block"
                                         />
                                     </div>
                                     <SelectPrimitive.Icon className="ml-2 shrink-0">
                                         {isLoading ? (
                                             <Loader2 className="h-4 w-4 animate-spin" />
                                         ) : (
                                              <ChevronDown className="h-4 w-4" />
                                          )}
                                     </SelectPrimitive.Icon>
                                 </>
                             )}
                        </SelectPrimitive.Trigger>
                        {isIconVariant && (
                            <>
                                {value && !isLoading && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                        <Check className="h-2.5 w-2.5" aria-hidden="true" />
                                    </span>
                                )}
                                {isLoading && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    <SelectPrimitive.Portal>
                        <SelectPrimitive.Content
                            className={cn(
                                'relative z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                                isIconVariant ? 'min-w-[8rem] w-fit' : 'min-w-[8rem] w-fit'
                            )}
                            position="popper"
                            sideOffset={5}
                            align={isIconVariant ? "end" : "start"}
                        >
                            <SelectPrimitive.Viewport className="p-1">
                                {options.map((option) => (
                                    <SelectPrimitive.Item
                                        key={option.value}
                                        value={option.value}
                                        className={cn(
                                            'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2',
                                            'outline-none focus:bg-accent focus:text-accent-foreground',
                                            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                                        )}
                                    >
                                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                            <SelectPrimitive.ItemIndicator>
                                                <Check className="h-4 w-4" />
                                            </SelectPrimitive.ItemIndicator>
                                        </span>
                                        <SelectPrimitive.ItemText className="truncate">
                                            {option.label}
                                        </SelectPrimitive.ItemText>
                                    </SelectPrimitive.Item>
                                ))}
                            </SelectPrimitive.Viewport>
                        </SelectPrimitive.Content>
                    </SelectPrimitive.Portal>
                </SelectPrimitive.Root>

                {description && !isIconVariant && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';

export default Select;
