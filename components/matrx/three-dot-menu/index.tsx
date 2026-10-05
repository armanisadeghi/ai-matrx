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
                <Button iconEnd={<MoreHorizontal />} variant="quiet" className="w-8">
                    <span className="sr-only">Open menu</span>
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
