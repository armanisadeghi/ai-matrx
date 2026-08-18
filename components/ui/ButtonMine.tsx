import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Define a union type for all possible size values
export type ButtonSize =
    | "default"
    | "xs"
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "icon"
    | "roundIcon"
    | "m"  // Keeping legacy sizes for backward compatibility
    | "l";

// Valid variants as a const array for runtime checking
const VALID_VARIANTS = [
    "default",
    "primary",
    "destructive",
    "success",
    "outline",
    "secondary",
    "ghost",
    "link"
] as const;

// Valid sizes as a const array for runtime checking
const VALID_SIZES = [
    "default",
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "icon",
    "roundIcon",
    "m",
    "l"
] as const;

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95",
    {
        variants: {
            variant: {
                default: "bg-blue-600 text-white shadow hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700",
                primary: "bg-blue-600 text-white shadow hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700",
                destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700",
                success: "bg-green-600 text-white shadow-sm hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700",
                outline: "border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white",
                secondary: "bg-gray-200 text-gray-900 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
                ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                link: "text-blue-600 underline-offset-4  dark:text-blue-500 dark:hover:text-blue-400",
            },
            size: {
                default: "h-9 px-4 py-2",
                xs: "h-6 rounded-md px-1 text-xs",
                sm: "h-7 rounded-md px-3 py-1 text-xs",
                md: "h-9 px-4 py-2",
                lg: "h-10 rounded-md px-8",
                xl: "h-12 px-8 py-3 text-base",
                "2xl": "h-14 px-10 py-3 text-base",
                "3xl": "h-16 px-12 py-3 text-base",
                icon: "h-10 w-10",
                roundIcon: "h-8 w-8 rounded-full p-0",
                // Legacy sizes
                m: "h-9 px-4 py-2",
                l: "h-10 px-6 py-2",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: VariantProps<typeof buttonVariants>["variant"]
    size?: ButtonSize
    asChild?: boolean
    className?: string
}

// Helper function to validate variant/size against allowed values
function isValidOption<T extends string>(value: unknown, validOptions: readonly T[]): value is T {
    return typeof value === 'string' && validOptions.includes(value as T);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        // Properly validate variant and size to ensure they are valid options
        // This prevents infinite loops when invalid values are passed
        const validVariant = isValidOption(variant, VALID_VARIANTS) ? variant : 'default';
        const validSize = isValidOption(size, VALID_SIZES) ? size : 'default';

        const Comp = asChild ? Slot : "button"

        // Use React.useMemo to prevent unnecessary recalculations of class names
        const buttonClassName = React.useMemo(() => {
            return cn(buttonVariants({
                variant: validVariant,
                size: validSize
            }), className);
        }, [validVariant, validSize, className]);

        return (
            <Comp
                className={buttonClassName}
                ref={ref}
                {...props}
            />
        )
    }
)

Button.displayName = "Button"

export { Button, buttonVariants }