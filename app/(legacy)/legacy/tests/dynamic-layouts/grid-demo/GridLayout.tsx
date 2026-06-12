import React from 'react';
import {cn} from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {Archive, Forward, ImageIcon, Mail, MoreHorizontal, Paperclip, Reply, Smile, Trash2} from "lucide-react";

type GridPosition = {
    startCol: number;
    endCol?: number;
    startRow: number;
    endRow?: number;
};

type GridItem = {
    id: string;
    position: GridPosition;
    content: React.ReactNode;
};

interface GridLayoutProps {
    items: GridItem[];
    gap?: number; // Gap size in Tailwind units (1-16)
    className?: string;
    preserveHeight?: boolean; // Whether to maintain row heights when empty
    minHeight?: string; // Minimum height for cells
}

const GridLayout: React.FC<GridLayoutProps> = (
    {
        items,
        gap = 4,
        className,
        preserveHeight = true,
        minHeight = '100px'
    }) => {
    // Create a 5x5 template
    const gridTemplate = {
        gridTemplateColumns: 'repeat(5, 1fr)',
        gridTemplateRows: preserveHeight ? `repeat(5, minmax(${minHeight}, auto))` : 'auto',
        gap: `${gap * 0.25}rem`
    };

    // Helper function to generate grid area style
    const getGridArea = (position: GridPosition) => ({
        gridColumn: `${position.startCol} / ${position.endCol ? position.endCol + 1 : position.startCol + 1}`,
        gridRow: `${position.startRow} / ${position.endRow ? position.endRow + 1 : position.startRow + 1}`
    });

    return (
        <div
            className={cn(
                "grid w-full",
                className
            )}
            style={gridTemplate}
        >
            {items.map(item => (
                <div
                    key={item.id}
                    className="min-w-0" // Prevent overflow
                    style={getGridArea(item.position)}
                >
                    {item.content}
                </div>
            ))}
        </div>
    );
};

// Example usage component
const ExampleLayout = () => {
    const items: GridItem[] = [
        // Centered item in row 1 (spans columns 2-4)
        {
            id: 'header',
            position: {startCol: 2, endCol: 4, startRow: 1},
            content: (
                <div className="h-full bg-primary text-primary-foreground p-4 rounded-lg">
                    Header (2-4, 1)
                </div>
            )
        },
        // Left sidebar (spans columns 1-2, rows 2-5)
        {
            id: 'sidebar',
            position: {startCol: 1, endCol: 2, startRow: 2, endRow: 5},
            content: (
                <div className="h-full bg-secondary text-secondary-foreground p-4 rounded-lg">
                    Sidebar (1-2, 2-5)
                </div>
            )
        },
        // Main content area
        {
            id: 'main',
            position: {startCol: 3, endCol: 5, startRow: 2, endRow: 4},
            content: (
                <div className="h-full bg-muted text-muted-foreground p-4 rounded-lg">
                    Main Content (3-5, 2-4)
                </div>
            )
        }
    ];

    return (
        <div className="p-4">
            <GridLayout
                items={items}
                gap={4}
                preserveHeight
                className="min-h-dvh bg-background border border-border rounded-lg p-4"
            />
        </div>
    );
};

// Email Content Component
const EmailContent = () => (
    <DashboardArea className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-semibold">Message Subject</h2>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon">
                    <Archive className="h-4 w-4"/>
                </Button>
                <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4"/>
                </Button>
                <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4"/>
                </Button>
            </div>
        </div>
        <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Mail className="h-5 w-5"/>
                        </div>
                        <div>
                            <h3 className="font-medium">Sender Name</h3>
                            <p className="text-sm text-muted-foreground">
                                to me and 3 others
                            </p>
                        </div>
                    </div>
                    <span className="text-sm text-muted-foreground">10:30 AM</span>
                </div>

                <div className="prose prose-sm max-w-none">
                    <p>Hi there,</p>
                    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
                        labore et dolore magna aliqua.</p>
                    <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
                        commodo consequat.</p>
                    <p>Best regards,<br/>Sender Name</p>
                </div>

                <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-medium mb-2">Attachments (2)</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                            <ImageIcon className="h-5 w-5 text-muted-foreground"/>
                            <span className="text-sm">image.jpg</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                            <Paperclip className="h-5 w-5 text-muted-foreground"/>
                            <span className="text-sm">document.pdf</span>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>
        <div className="border-t p-4">
            <div className="flex gap-2 mb-4">
                <Button>
                    <Reply className="h-4 w-4 mr-2"/> Reply
                </Button>
                <Button variant="outline">
                    <Forward className="h-4 w-4 mr-2"/> Forward
                </Button>
            </div>
            <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-muted-foreground">
                        Reply to Sender Name
                    </span>
                </div>
                <Input
                    placeholder="Write your reply..."
                    className="bg-background mb-2"
                />
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon">
                            <Paperclip className="h-4 w-4"/>
                        </Button>
                        <Button variant="ghost" size="icon">
                            <ImageIcon className="h-4 w-4"/>
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Smile className="h-4 w-4"/>
                        </Button>
                    </div>
                    <Button>Send</Button>
                </div>
            </div>
        </div>
    </DashboardArea>
);


// Utility component for creating dashboard layouts
const DashboardArea: React.FC<{
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}> = ({children, className, style}) => {
    return (
        <div
            className={cn(
                "bg-card text-card-foreground rounded-lg border border-border p-4",
                "overflow-hidden min-h-full",
                className
            )}
            style={style}
        >
            {children}
        </div>
    );
};

// Pre-configured layouts
const commonLayouts = {
    standard: [
        {id: 'header', position: {startCol: 1, endCol: 5, startRow: 1}},
        {id: 'sidebar', position: {startCol: 1, endCol: 1, startRow: 2, endRow: 5}},
        {id: 'main', position: {startCol: 2, endCol: 5, startRow: 2, endRow: 5}}
    ],
    threeColumn: [
        {id: 'header', position: {startCol: 1, endCol: 5, startRow: 1}},
        {id: 'leftSidebar', position: {startCol: 1, endCol: 1, startRow: 2, endRow: 5}},
        {id: 'content', position: {startCol: 2, endCol: 4, startRow: 2, endRow: 5}},
        {id: 'rightSidebar', position: {startCol: 5, endCol: 5, startRow: 2, endRow: 5}}
    ],
    dashboard: [
        {id: 'header', position: {startCol: 1, endCol: 5, startRow: 1}},
        {id: 'widget1', position: {startCol: 1, endCol: 2, startRow: 2}},
        {id: 'widget2', position: {startCol: 3, endCol: 4, startRow: 2}},
        {id: 'mainChart', position: {startCol: 1, endCol: 4, startRow: 3, endRow: 4}},
        {id: 'sidebar', position: {startCol: 5, endCol: 5, startRow: 2, endRow: 5}}
    ]
};
export {
    GridLayout,
    DashboardArea,
    commonLayouts,
    type GridPosition,
    type GridItem
};

/* Example
const MyPage = () => {
    const items = [
        {
            id: 'header',
            position: { startCol: 2, endCol: 4, startRow: 1 },
            content: <MyHeader />
        },
        {
            id: 'sidebar',
            position: { startCol: 1, startRow: 2, endRow: 5 },
            content: <MySidebar />
        }
    ];

    return <GridLayout items={items} />;
};
*/
