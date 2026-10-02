"use client";
import React, { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { createCardStyles } from "@/components/official/styles";
import { useIsMobile } from "@ai-matrx/kit/media-query";

interface SectionCardProps {
    title?: string;
    titleNode?: ReactNode;
    description?: string;
    descriptionNode?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    gridCols?: number; // Number of columns for the grid
    gridGap?: string; // Gap between grid items
    autoGrid?: boolean; // Whether to enable auto grid or not
    headerActions?: ReactNode; // Add header actions support for buttons
    color?: string;
    spacing?: string;
    minHeight?: string; // Minimum height of the card content
    maxHeight?: string; // Maximum height of the card content
    scrollable?: boolean; // Whether to enable scrolling when content exceeds maxHeight
}

const SectionCard: React.FC<SectionCardProps> = ({
    title,
    titleNode,
    description,
    descriptionNode,
    children,
    footer,
    gridCols = 3,
    gridGap = "1rem",
    autoGrid = false,
    headerActions,
    color = "rose",
    spacing = "default",
    minHeight,
    maxHeight,
    scrollable = true, // Default to true when maxHeight is set
}) => {
    const isMobile = useIsMobile();
    
    const getGridClasses = () => {
        if (!autoGrid) return "";
        // Tailwind grid classes based on columns
        const gridColsClass =
            {
                1: "grid-cols-1",
                2: "grid-cols-1 sm:grid-cols-2",
                3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
                4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
                5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
                6: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
            }[gridCols] || "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
        return `grid ${gridColsClass} gap-${gridGap}`;
    };
    
    // Updated to use the new createCardStyles function
    const getCardClasses = () => {
        return createCardStyles({ color, spacing });
    };
    
    // Get content classes (for grid)
    const getContentClasses = () => {
        return autoGrid ? getGridClasses() : "";
    };
    
    // Create inline styles for height constraints
    const getContentStyles = () => {
        const styles: React.CSSProperties = {};
        
        // Only apply height constraints on non-mobile devices
        if (!isMobile) {
            // Add height constraints if provided
            if (minHeight) {
                styles.minHeight = minHeight;
            }
            
            // Add max height and scrolling if applicable
            if (maxHeight) {
                styles.maxHeight = maxHeight;
                if (scrollable) {
                    styles.overflowY = 'auto';
                }
            }
        }
        
        return styles;
    };
    
    return (
        <Card className={getCardClasses().card}>
            <CardHeader className={getCardClasses().cardHeader}>
                <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-center">
                    <div className="flex flex-col gap-1">
                        {titleNode ? (
                            <div className={getCardClasses().cardTitle}>{titleNode}</div>
                        ) : title ? (
                            <CardTitle className={getCardClasses().cardTitle}>{title}</CardTitle>
                        ) : null}
                        {description && !descriptionNode && <div className={getCardClasses().cardDescription}>{description}</div>}
                        {descriptionNode && <div className={getCardClasses().cardDescriptionNode}>{descriptionNode}</div>}
                    </div>
                    {headerActions && <div className="flex items-center">{headerActions}</div>}
                </div>
            </CardHeader>
            <CardContent className={getContentClasses()} style={getContentStyles()}>{children}</CardContent>
            {footer && <CardFooter className={getCardClasses().cardFooter}>{footer}</CardFooter>}
        </Card>
    );
};

export default SectionCard;