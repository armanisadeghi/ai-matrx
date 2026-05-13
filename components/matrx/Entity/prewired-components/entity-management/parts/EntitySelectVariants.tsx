import React, {useState} from 'react';
import {Card} from "@/components/ui/card";
import {Input, InputWithPrefix} from "@/components/ui/input";
import { motion } from "motion/react";
import {Search} from "lucide-react";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Badge} from "@/components/ui/badge";
import {Command} from "cmdk";
import {Carousel} from "@/components/ui/carousel";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import {EntityKeys, EntitySelectOption} from "@/types/entityTypes";
import { Input as BaseInput, InputProps as BaseInputProps } from "@/components/ui/input";
import { InlineMediaRef } from "@/features/files";

interface EntitySelectProps<TEntity extends EntityKeys> {
    value: TEntity | undefined;
    options: EntitySelectOption<TEntity>[];
    onValueChange: (value: TEntity) => void;
    placeholder?: string;
}

interface EntitySelectOptionWithImage<TEntity extends EntityKeys> extends EntitySelectOption<TEntity> {
    imageUrl?: string;
}

interface EntityCarouselProps<TEntity extends EntityKeys> extends Omit<EntitySelectProps<TEntity>, 'options'> {
    options: EntitySelectOptionWithImage<TEntity>[];
}
interface InputProps extends Omit<BaseInputProps, 'prefix'> {
    prefix?: React.ReactNode;
}


export const EntityCardGrid = <TEntity extends EntityKeys>(
    {
        value,
        options,
        onValueChange,
        placeholder
    }: EntitySelectProps<TEntity>) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const filteredOptions = options.filter(opt =>
        String(opt.label).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="relative">
            {!isExpanded && value ? (
                <Card
                    className="p-4 cursor-pointer hover:bg-muted"
                    onClick={() => setIsExpanded(true)}
                >
                    {String(selectedOption?.label)}
                </Card>
            ) : (
                <motion.div
                    initial={{height: 0}}
                    animate={{height: "auto"}}
                    exit={{height: 0}}
                >
                    <div className="mb-4">
                        <InputWithPrefix
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            prefix={<Search className="w-4 h-4"/>}
                        />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {filteredOptions.map(({value: val, label}) => (
                            <Card
                                key={val}
                                className={`p-4 cursor-pointer transition-colors ${
                                    value === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                                }`}
                                onClick={() => {
                                    onValueChange(val);
                                    setIsExpanded(false);
                                }}
                            >
                                {String(label)}
                            </Card>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export const EntityChips = <TEntity extends EntityKeys>(
    {
        value,
        options,
        onValueChange,
        placeholder
    }: EntitySelectProps<TEntity>) => (
    <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex space-x-2 p-2">
            {options.map(({value: val, label}) => (
                <Badge
                    key={val}
                    variant={value === val ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => onValueChange(val)}
                >
                    {label}
                </Badge>
            ))}
        </div>
    </ScrollArea>
);


export const EntityCommandMenu = <TEntity extends EntityKeys>(
    {
        value,
        options,
        onValueChange,
        placeholder
    }: EntitySelectProps<TEntity>) => {
    const [open, setOpen] = useState(false);

    return (
        <Command.Dialog open={open} onOpenChange={setOpen}>
            <Command.Input placeholder={placeholder}/>
            <Command.List>
                <Command.Group>
                    {options.map(({value: val, label}) => (
                        <Command.Item
                            key={val}
                            onSelect={() => {
                                onValueChange(val);
                                setOpen(false);
                            }}
                        >
                            {label}
                        </Command.Item>
                    ))}
                </Command.Group>
            </Command.List>
        </Command.Dialog>
    );
};


export const EntityCarousel = <TEntity extends EntityKeys>({
                                                               value,
                                                               options,
                                                               onValueChange,
                                                               placeholder
                                                           }: EntityCarouselProps<TEntity>) => (
    <Carousel className="w-full max-w-xs mx-auto">
        {options.map(({value: val, label, imageUrl}) => (
            <div
                key={val}
                className={`relative cursor-pointer ${
                    value === val ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onValueChange(val)}
            >
                {imageUrl && (
                    <InlineMediaRef
                        ref={imageUrl}
                        alt={String(label)}
                        size="fill"
                        fit="cover"
                        rounded="none"
                        className="w-full h-40"
                    />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 text-white">
                    {String(label)}
                </div>
            </div>
        ))}
    </Carousel>
);


export const EntityTree = <TEntity extends EntityKeys>({
                                                           value,
                                                           options,
                                                           onValueChange,
                                                       }: EntitySelectProps<TEntity>) => {
    // Since we don't have categories, let's group by first letter
    const groupedOptions = options.reduce((acc: Record<string, EntitySelectOption<TEntity>[]>, curr) => {
        const firstLetter = curr.label.toString().charAt(0).toUpperCase();
        if (!acc[firstLetter]) acc[firstLetter] = [];
        acc[firstLetter].push(curr);
        return acc;
    }, {});

    return (
        <div className="space-y-2">
            {Object.entries(groupedOptions).map(([letter, items]) => (
                <Collapsible key={letter}>
                    <CollapsibleTrigger className="flex w-full justify-between p-2 hover:bg-muted">
                        {letter}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="pl-4 space-y-1">
                            {items.map(({value: val, label}) => (
                                <div
                                    key={val}
                                    className={`p-2 cursor-pointer rounded ${
                                        value === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                                    }`}
                                    onClick={() => onValueChange(val)}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            ))}
        </div>
    );
};

