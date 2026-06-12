"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    getAppIconOptions,
    getAppIcon,
    getSubmitButton,
    getAppIconWithBg
} from "@/features/applet/styles/StyledComponents";

interface IconPickerProps {
    selectedIcon: string;
    onIconSelect: (iconName: string) => void;
    dialogTitle?: string;
    dialogDescription?: string;
    defaultIcon?: string;
    primaryColor?: string;
    accentColor?: string;
    iconType: "appIcon" | "submitIcon";
    className?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
    selectedIcon,
    onIconSelect,
    dialogTitle = "Select an Icon",
    dialogDescription = "Choose an icon for your application",
    defaultIcon = "AppWindowIcon",
    primaryColor = "gray",
    accentColor = "blue",
    iconType = "appIcon",
    className = "",
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Get all available app icons
    const iconOptions = useMemo(() => getAppIconOptions(), []);
    
    // Filter icons based on search term
    const filteredIcons = useMemo(() => {
        if (!searchTerm.trim()) return iconOptions;
        
        return iconOptions.filter(({ name }) => 
            name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [iconOptions, searchTerm]);
    
    // Generate the selected icon using the appropriate function
    const currentIcon = iconType === "appIcon"
        ? getAppIconWithBg({
            color: accentColor,
            primaryColor: primaryColor,
            icon: selectedIcon || defaultIcon,
            size: 24
        })
        : getSubmitButton({
            color: accentColor,
            icon: selectedIcon || defaultIcon,
            size: 24
        });

    return (
        <>
            <div 
                onClick={() => setIsOpen(true)} 
                className={`cursor-pointer ${className}`}
            >
                {currentIcon}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{dialogTitle}</DialogTitle>
                        <DialogDescription>{dialogDescription}</DialogDescription>
                    </DialogHeader>

                    <div className="mb-4">
                        <Input
                            placeholder="Search icons..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 overflow-y-auto max-h-[60dvh]">
                        {filteredIcons.map(({ name }) => {
                            const isSelected = name === (selectedIcon || defaultIcon);
                            
                            // Generate the icon using the appropriate function based on type
                            const gridIcon = iconType === "appIcon"
                                ? getAppIconWithBg({
                                    color: accentColor,
                                    primaryColor: primaryColor,
                                    icon: name,
                                    size: 24
                                })
                                : getSubmitButton({
                                    color: accentColor,
                                    icon: name,
                                    size: 24
                                });

                            if (!gridIcon) return null;

                            return (
                                <Button
                                    key={name}
                                    variant={isSelected ? "default" : "outline"}
                                    onClick={() => {
                                        onIconSelect(name);
                                        setIsOpen(false);
                                    }}
                                    className="h-12 w-12 p-1 flex items-center justify-center"
                                >
                                    {gridIcon}
                                </Button>
                            );
                        })}
                    </div>

                    <DialogFooter>
                        <div className="w-full flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">{filteredIcons.length} icons</p>
                            <Button variant="outline" onClick={() => setIsOpen(false)}>
                                Cancel
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default IconPicker;