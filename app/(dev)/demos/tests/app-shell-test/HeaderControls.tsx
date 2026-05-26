import React from 'react';
import {useModuleHeader} from '@/providers/ModuleHeaderProvider';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import ConfigDialog from './components/ConfigDialog';
import { HeaderControlsProps, LayoutType } from './types';

export function HeaderControls(
    {
        selectedLayout,
        setSelectedLayout,
        enhancedProps,
        setEnhancedProps
    }: HeaderControlsProps) {
    const {addHeaderItem, removeHeaderItem} = useModuleHeader();

    React.useEffect(() => {
        addHeaderItem({
            id: 'layout-selector',
            component: (
                <Select
                    value={selectedLayout}
                    onValueChange={(value) => setSelectedLayout(value as LayoutType)}
                >
                    <SelectTrigger className="h-8 w-48">
                        <SelectValue placeholder="Select a layout"/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="EnhancedDynamicLayout">Enhanced Dynamic Layout</SelectItem>
                        <SelectItem value="AdvancedDynamicLayoutNew">Advanced Dynamic Layout New</SelectItem>
                        <SelectItem value="AdvancedDynamicLayout">Advanced Dynamic Layout</SelectItem>
                        <SelectItem value="AdvancedLayout">Advanced Layout</SelectItem>
                        <SelectItem value="DynamicLayout">Dynamic Layout</SelectItem>
                    </SelectContent>
                </Select>
            ),
            section: 'left',
            priority: 2
        });

        if (selectedLayout === 'EnhancedDynamicLayout') {
            addHeaderItem({
                id: 'layout-config',
                component: <ConfigDialog enhancedProps={enhancedProps} setEnhancedProps={setEnhancedProps}/>,
                section: 'left',
                priority: 1
            });
        }

        return () => {
            removeHeaderItem('layout-selector');
            removeHeaderItem('layout-config');
        };
    }, [selectedLayout, enhancedProps, setEnhancedProps, addHeaderItem, removeHeaderItem]);

    return null;
}