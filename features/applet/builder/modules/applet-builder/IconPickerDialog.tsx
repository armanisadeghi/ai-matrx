'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAppIconOptions } from '@/features/applet/styles/StyledComponents';

interface IconPickerDialogProps {
  showIconPicker: boolean;
  setShowIconPicker: (show: boolean) => void;
  handleIconSelect: (iconName: string) => void;
}

export const IconPickerDialog: React.FC<IconPickerDialogProps> = ({
  showIconPicker,
  setShowIconPicker,
  handleIconSelect
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Memoize the available icons using the utility from StyledComponents
  const availableIcons = useMemo(() => {
    return getAppIconOptions();
  }, []);

  // Memoize the filtered icons based on search term
  const filteredIcons = useMemo(() => {
    if (!searchTerm) return availableIcons;
    return availableIcons.filter(icon => 
      icon.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [availableIcons, searchTerm]);

  return (
    <Dialog open={showIconPicker} onOpenChange={setShowIconPicker}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select an Icon</DialogTitle>
          <DialogDescription>
            Choose an icon for your applet
          </DialogDescription>
        </DialogHeader>
        
        <div className="mb-4">
          <Input
            placeholder="Search icons..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-gray-200 dark:border-gray-700 bg-textured"
          />
        </div>
        
        <div className="py-4 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
            {filteredIcons.map(({ name, component: IconComponent }) => (
              <Button
                key={name}
                variant="outline"
                size="sm"
                className="h-12 flex flex-col items-center justify-center border-gray-200 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                onClick={() => handleIconSelect(name)}
              >
                {IconComponent && <IconComponent size={20} />}
                <span className="text-xs mt-1 text-gray-500 dark:text-gray-400 truncate w-full text-center">
                  {name.length > 10 ? `${name.substring(0, 10)}...` : name}
                </span>
              </Button>
            ))}
          </div>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowIconPicker(false)}
            className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IconPickerDialog;
