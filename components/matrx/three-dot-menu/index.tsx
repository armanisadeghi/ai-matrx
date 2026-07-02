import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ThreeDotMenuItem {
    text: string;
    onClick: (itemId: string) => void;
}

const ThreeDotMenu = ({
    items,
    itemId,
}: {
    items: ThreeDotMenuItem[];
    itemId: string;
}) => {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {items.map((item, index) => (
                    <DropdownMenuItem
                        key={index}
                        onClick={(e) => {
                            e.stopPropagation();
                            item.onClick(itemId);
                        }}
                    >
                        {item.text}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ThreeDotMenu;
