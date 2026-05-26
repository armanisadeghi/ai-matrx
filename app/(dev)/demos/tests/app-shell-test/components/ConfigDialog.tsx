import React from 'react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import { EnhancedProps } from '../types';


const ConfigDialog = ({enhancedProps, setEnhancedProps}: {
    enhancedProps: EnhancedProps;
    setEnhancedProps: React.Dispatch<React.SetStateAction<EnhancedProps>>;
}) => (
    <Dialog>
        <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
                Configure
            </Button>
        </DialogTrigger>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Enhanced Layout Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Background Color</Label>
                    <Select
                        value={enhancedProps.backgroundColor}
                        onValueChange={(value) => setEnhancedProps(prev => ({...prev, backgroundColor: value}))}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bg-gray-900">Gray 900</SelectItem>
                            <SelectItem value="bg-slate-900">Slate 900</SelectItem>
                            <SelectItem value="bg-zinc-900">Zinc 900</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Gap Size</Label>
                    <Select
                        value={enhancedProps.gap}
                        onValueChange={(value: 'small' | 'medium' | 'large') =>
                            setEnhancedProps(prev => ({ ...prev, gap: value }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Padding Size</Label>
                    <Select
                        value={enhancedProps.padding}
                        onValueChange={(value: 'small' | 'medium' | 'large') =>
                            setEnhancedProps(prev => ({ ...prev, padding: value }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="small">Small</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center justify-between">
                    <Label>Rounded Corners</Label>
                    <Switch
                        checked={enhancedProps.rounded}
                        onCheckedChange={(checked) =>
                            setEnhancedProps(prev => ({ ...prev, rounded: checked }))
                        }
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label>Animate</Label>
                    <Switch
                        checked={enhancedProps.animate}
                        onCheckedChange={(checked) =>
                            setEnhancedProps(prev => ({ ...prev, animate: checked }))
                        }
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label>Hover Effect</Label>
                    <Switch
                        checked={enhancedProps.hoverEffect}
                        onCheckedChange={(checked) =>
                            setEnhancedProps(prev => ({ ...prev, hoverEffect: checked }))
                        }
                    />
                </div>
            </div>
        </DialogContent>
    </Dialog>
);

export default ConfigDialog;