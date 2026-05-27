'use client';

import * as React from "react";
import {Button} from "@/components/ui/button";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle,
    CredenzaTrigger,
} from "@/components/ui/credenza-modal/credenza";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {PlusCircle} from "lucide-react";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {RadioGroup, RadioGroupItem} from "@/components/ui/radio-group";
import {Checkbox} from "@/components/ui/checkbox";

// Component map for rendering components dynamically
const componentMap: Record<string, React.FC<any>> = {
    Label,
    Input,
    Switch,
    Checkbox,
    Textarea,
    RadioGroup,
    RadioGroupItem,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    // Add other components here as needed
};

// Function to render a component dynamically, including handling children
const renderDynamicComponent = (component: { name: string; props: any }) => {
    const Component = componentMap[component.name];
    if (!Component) {
        console.error(`Component ${component.name} not found in componentMap.`);
        return null;
    }

    // Recursively render children if they are objects (nested components)
    if (Array.isArray(component.props.children)) {
        return (
            <Component {...component.props}>
                {component.props.children.map((childComponent: any, index: number) => (
                    <React.Fragment key={index}>
                        {renderDynamicComponent(childComponent)}
                    </React.Fragment>
                ))}
            </Component>
        );
    }

    // Render the component normally if it has no nested children
    return <Component {...component.props} />;
};

// DynamicTabContent component for rendering components within a tab
interface DynamicTabContentProps {
    components: { name: string; props: any }[];
}

const DynamicTabContent: React.FC<DynamicTabContentProps> = ({components}) => {
    return (
        <CredenzaBody>
            <div className="space-y-4 py-2 pb-4">
                {components.map((component, index) => (
                    <div key={index} className="space-y-2">
                        {renderDynamicComponent(component)}
                    </div>
                ))}
            </div>
        </CredenzaBody>
    );
};

// Main component that dynamically generates both the Tabs and their content
interface DynamicTabsProps {
    tabs: {
        value: string;
        label: string;
        components: { name: string; props: any }[];
    }[];
}

const DynamicTabs: React.FC<DynamicTabsProps> = ({tabs}) => {
    const numberOfTabs = tabs.length;

    return (
        <Tabs defaultValue={tabs[0]?.value} className="w-full">
            {/* Dynamically adjusting the grid columns based on the number of tabs */}
            <TabsList className={`grid w-full grid-cols-${numberOfTabs}`}>
                {tabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>

            {/* Rendering dynamic content for each tab */}
            {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                    <DynamicTabContent components={tab.components}/>
                </TabsContent>
            ))}
        </Tabs>
    );
};

// Sample data for tabs
const tabsData = [
    {
        value: "dynamic1",
        label: "Dynamic Tab 1",
        components: [
            {name: "Label", props: {htmlFor: "name", children: "Name"}},
            {name: "Input", props: {id: "name", placeholder: "Enter your name"}},
        ],
    },
    {
        value: "dynamic2",
        label: "Dynamic Tab 2",
        components: [
            {name: "Label", props: {htmlFor: "email", children: "Email"}},
            {name: "Input", props: {id: "email", placeholder: "Enter your email", type: "email"}},
        ],
    },
    {
        value: "dynamic3",
        label: "Dynamic Tab 3",
        components: [
            {name: "Label", props: {htmlFor: "name", children: "Name"}},
            {name: "Input", props: {id: "name", placeholder: "Enter your name"}},
            {name: "Label", props: {htmlFor: "email", children: "Email"}},
            {name: "Input", props: {id: "email", placeholder: "Enter your email", type: "email"}},
            {name: "Switch", props: {id: "marketing"}},
            {name: "Label", props: {htmlFor: "marketing", children: "Receive marketing emails"}},
            {name: "Label", props: {htmlFor: "name", children: "Name"}},
            {name: "Input", props: {id: "name", placeholder: "Type product name", className: "mt-1"}},
            {
                name: "div", // Wrapper div for grid layout
                props: {
                    className: "grid grid-cols-2 gap-4",
                    children: [
                        {name: "Label", props: {htmlFor: "price", children: "Price"}},
                        {name: "Input", props: {id: "price", type: "number", placeholder: "$2999", className: "mt-1"}},
                        {name: "Label", props: {htmlFor: "category", children: "Category"}},
                        {
                            name: "Select",
                            props: {
                                children: [
                                    {
                                        name: "SelectTrigger",
                                        props: {
                                            className: "mt-1",
                                            children: [{name: "SelectValue", props: {placeholder: "Select category"}}],
                                        },
                                    },
                                    {
                                        name: "SelectContent",
                                        props: {
                                            children: [
                                                {name: "SelectItem", props: {value: "tv", children: "TV/Monitors"}},
                                                {name: "SelectItem", props: {value: "pc", children: "PC"}},
                                                {
                                                    name: "SelectItem",
                                                    props: {value: "gaming", children: "Gaming/Console"}
                                                },
                                                {name: "SelectItem", props: {value: "phones", children: "Phones"}},
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            {name: "Label", props: {htmlFor: "description", children: "Product Description"}},
            {
                name: "Textarea",
                props: {id: "description", placeholder: "Write product description here", className: "mt-1"}
            },
            {name: "Label", props: {children: "Product Type"}},
            {
                name: "RadioGroup",
                props: {
                    defaultValue: "physical",
                    className: "mt-2",
                    children: [
                        {
                            name: "div",
                            props: {
                                className: "flex items-center space-x-2",
                                children: [
                                    {name: "RadioGroupItem", props: {value: "physical", id: "physical"}},
                                    {name: "Label", props: {htmlFor: "physical", children: "Physical"}},
                                ],
                            },
                        },
                        {
                            name: "div",
                            props: {
                                className: "flex items-center space-x-2",
                                children: [
                                    {name: "RadioGroupItem", props: {value: "digital", id: "digital"}},
                                    {name: "Label", props: {htmlFor: "digital", children: "Digital"}},
                                ],
                            },
                        },
                    ],
                },
            },
            {
                name: "div",
                props: {
                    className: "flex items-center space-x-2",
                    children: [
                        {name: "Checkbox", props: {id: "terms"}},
                        {name: "Label", props: {htmlFor: "terms", children: "I agree to the terms and conditions"}},
                    ],
                },
            },
        ],
    },
];


const toTitleCase = (str: string) => {
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};

interface DynamicInputProps {
    inputValue: string;
    onInputChange: (value: string) => void;
    name: string;
    label?: string;
    inputType?: string;
    inputPlaceholder?: string;
}

const DynamicInput: React.FC<DynamicInputProps> = (
    {
        label,
        inputType = 'text',
        inputPlaceholder,
        inputValue,
        onInputChange,
        name,
    }) => {
    // Generate the label if not provided, converting name to Title Case
    const generatedLabel = label || toTitleCase(name);

    // Generate placeholder if not provided
    const generatedPlaceholder = inputPlaceholder || `Enter ${generatedLabel}`;

    // Generate a unique id based on name and a random number
    const uniqueId = `${name}-${Math.floor(Math.random() * 10000)}`;

    return (
        <div>
            <Label htmlFor={uniqueId}>{generatedLabel}</Label>
            <Input
                id={uniqueId}
                type={inputType}
                placeholder={generatedPlaceholder}
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                className="mt-1"
            />
        </div>
    );
};


interface DynamicSelectProps {
    label: string;
    selectOptions: { value: string; label: string }[];
    selectedOption: string;
    onSelectChange: (value: string) => void;
}

const DynamicSelect: React.FC<DynamicSelectProps> = (
    {
        label,
        selectOptions,
        selectedOption,
        onSelectChange,
    }) => {
    return (
        <div>
            <Label htmlFor="dynamicSelect">{label}</Label>
            <Select value={selectedOption} onValueChange={onSelectChange}>
                <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select option"/>
                </SelectTrigger>
                <SelectContent>
                    {selectOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};


interface GenericFormProps {
    inputLabel: string;
    inputType: string;
    inputPlaceholder: string;
    inputValue: string;
    onInputChange: (value: string) => void;

    selectLabel: string;
    selectOptions: { value: string; label: string }[];
    selectedOption: string;
    onSelectChange: (value: string) => void;
}

const GenericForm: React.FC<GenericFormProps> = (
    {
        inputLabel,
        inputType,
        inputPlaceholder,
        inputValue,
        onInputChange,
        selectLabel,
        selectOptions,
        selectedOption,
        onSelectChange,
    }) => {
    return (
        <div className="grid grid-cols-2 gap-4">
            {/* Dynamic Input */}
            <div>
                <Label htmlFor="dynamicInput">{inputLabel}</Label>
                <Input
                    id="dynamicInput"
                    type={inputType}
                    placeholder={inputPlaceholder}
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    className="mt-1"
                />
            </div>

            {/* Dynamic Select */}
            <div>
                <Label htmlFor="dynamicSelect">{selectLabel}</Label>
                <Select value={selectedOption} onValueChange={onSelectChange}>
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select option"/>
                    </SelectTrigger>
                    <SelectContent>
                        {selectOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};


interface DynamicFormProps {
    InputComponent: React.FC<any>;
    SelectComponent: React.FC<any>;
}


const DynamicForm: React.FC<DynamicFormProps> = ({InputComponent, SelectComponent}) => {
    return (
        <div className="grid grid-cols-2 gap-4">
            {/* Dynamically render the input component */}
            <InputComponent/>

            {/* Dynamically render the select component */}
            <SelectComponent/>
        </div>
    );
};


function OpenModal() {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Credenza open={isOpen} onOpenChange={setIsOpen}>
            <CredenzaTrigger asChild>
                <Button variant="outline"
                        className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded shadow">
                    <PlusCircle className="mr-2 h-4 w-4"/> Open Enhanced Modal
                </Button>
            </CredenzaTrigger>
            <CredenzaContent className="sm:max-w-[425px]">
                <CredenzaHeader>
                    <CredenzaTitle className="text-2xl font-bold">Table Data</CredenzaTitle>
                    <CredenzaDescription>View, Edit and Manage Data here.</CredenzaDescription>
                </CredenzaHeader>
                <DynamicTabs tabs={tabsData}/>

                <CredenzaFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => setIsOpen(false)}>Save changes</Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

export default OpenModal;
