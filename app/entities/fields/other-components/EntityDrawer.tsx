// components/matrx/ArmaniForm/field-components/EntityDrawer.tsx
import React from "react";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {PresentationSize} from "@/components/matrx/ArmaniForm/action-system/presentation/types";


export type BaseDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: React.ReactNode;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    showFooter?: boolean;
    side?: 'left' | 'right';
    size?: PresentationSize; //  'sm' | 'default' | 'lg' | 'xl' | 'full';
};

const sizeClasses = {
    sm: 'max-h-[35dvh] md:max-h-[35dvh]',
    default: 'max-h-[50dvh] md:max-h-[50dvh]',
    lg: 'max-h-[65dvh] md:max-h-[65dvh]',
    xl: 'max-h-[75dvh] md:max-h-[75dvh]',
    full: 'max-h-dvh'
};

const centerSizeClasses = {
    sm: 'w-[90vw] max-w-[400px]',
    default: 'w-[90vw] max-w-[500px]',
    lg: 'w-[90vw] max-w-[700px]',
    xl: 'w-[90vw] max-w-[900px]',
    full: 'w-[95vw] max-w-[1200px]'
};

export function BottomDrawer(
    {
        open,
        onOpenChange,
        trigger,
        title,
        description,
        children,
        className,
        showFooter = true,
        size = 'lg'
    }: BaseDrawerProps) {
    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerTrigger asChild>{trigger}</DrawerTrigger>
            <DrawerContent className={cn("inset-x-0 bottom-0", sizeClasses[size], className)}>
                {(title || description) && (
                    <DrawerHeader>
                        {title && <DrawerTitle>{title}</DrawerTitle>}
                        {description && <DrawerDescription>{description}</DrawerDescription>}
                    </DrawerHeader>
                )}
                <div className="px-4">{children}</div>
                {showFooter && (
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    );
}

export function TopDrawer(
    {
        open,
        onOpenChange,
        trigger,
        title,
        description,
        children,
        className,
        showFooter = true,
        size = 'lg'
    }: BaseDrawerProps) {
    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerTrigger asChild>{trigger}</DrawerTrigger>
            <DrawerContent className={cn("inset-x-0 top-0", sizeClasses[size], className)}>
                {(title || description) && (
                    <DrawerHeader>
                        {title && <DrawerTitle>{title}</DrawerTitle>}
                        {description && <DrawerDescription>{description}</DrawerDescription>}
                    </DrawerHeader>
                )}
                <div className="px-4">{children}</div>
                {showFooter && (
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    );
}

export function CenterDrawer(
    {
        open,
        onOpenChange,
        trigger,
        title,
        description,
        children,
        className,
        showFooter = true,
        size = 'default'
    }: BaseDrawerProps) {
    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerTrigger asChild>{trigger}</DrawerTrigger>
            <DrawerContent
                className={cn(
                    "fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] rounded-lg",
                    centerSizeClasses[size],
                    className
                )}
            >
                {(title || description) && (
                    <DrawerHeader>
                        {title && <DrawerTitle>{title}</DrawerTitle>}
                        {description && <DrawerDescription>{description}</DrawerDescription>}
                    </DrawerHeader>
                )}
                <div className="px-4">{children}</div>
                {showFooter && (
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    );
}

// Side Drawer
export function SideDrawer(
    {
        open,
        onOpenChange,
        trigger,
        title,
        description,
        children,
        className,
        showFooter = true,
        side = 'right',
        size = 'full',
    }: BaseDrawerProps) {
    const sizeClasses = {
        sm: 'w-[280px]',
        md: 'w-[400px]',
        lg: 'w-[600px]',
        xl: 'w-[800px]',
        full: 'w-full'
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerTrigger asChild>
                {trigger}
            </DrawerTrigger>
            <DrawerContent
                className={cn(
                    "inset-y-0 h-full flex flex-col",
                    side === 'left' ? 'left-0' : 'right-0',
                    sizeClasses[size],
                    className
                )}
            >
                {(title || description) && (
                    <DrawerHeader>
                        {title && <DrawerTitle>{title}</DrawerTitle>}
                        {description && <DrawerDescription>{description}</DrawerDescription>}
                    </DrawerHeader>
                )}
                <div className="flex-1 overflow-y-auto px-4">
                    {children}
                </div>
                {showFooter && (
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                        </DrawerClose>
                    </DrawerFooter>
                )}
            </DrawerContent>
        </Drawer>
    );
}

