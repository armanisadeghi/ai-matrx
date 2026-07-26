import {cn} from "@/lib/utils";
import {Star} from "@mynaui/icons-react";

interface starProps {
    rating?: number;
    filled?: boolean;
    color?: "amber" | "slate" | "red" | "green";
    disabled?: boolean;
    size?: "sm" | "md" | "lg";
    viewOnly?: boolean;
    onChange?: (rating: number) => void; // Add this to handle the rating change
}

const StarRating = (
    {
        rating = 1,
        filled = false,
        color = "amber",
        disabled = false,
        size = "md",
        viewOnly = false,
        onChange,  // Add onChange here
    }: starProps) => {
    const starColor = {
        amber: "text-amber-500",
        slate: "text-muted-foreground",
        red: "text-red-500",
        green: "text-emerald-500",
    };

    const starSize = {
        sm: "size-3",
        md: "size-5",
        lg: "size-8",
    };

    const handleClick = () => {
        if (!disabled && onChange) {
            onChange(rating);  // Call onChange when clicked
        }
    };

    const StarSVG = () => (
        <Star
            className={cn(
                "shrink-0",
                filled ? starColor[color] : "text-border",
                starSize[size],
            )}
            fill="currentColor"
        />
    );

    return (
        <>
            {viewOnly ? (
                <StarSVG/>
            ) : (
                <button
                    className="appearance-none disabled:opacity-50"
                    type="button"
                    aria-label={`Star ${rating} out of 5`}
                    onClick={handleClick}  // Trigger handleClick
                    disabled={disabled}
                >
                    <StarSVG/>
                </button>
            )}
        </>
    );
};

export default StarRating;
