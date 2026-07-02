import HelpIcon from "@/components/official/HelpIcon";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";


export const fieldHelpTextItems = {
    label: "The label or name. This is the most promanent thing the user will see. For convenience, this defaults to the broker name, but it can be changed to any value.",
    description:
        "The description is not always visible, depending on your chosen layout. It's a good practice to have one just in case, But the system is designed to work seamlessly without it.",
    helpText:
        "If you don't enter a value, it's perfectly fine. \nIf you enter any text, then the user will see an icon exactly like the one you just hovered and they will see exactly the same thing you're looking at now.",
    placeholder:
        "For most fields, this is not relevant and the system provides a default placeholder, but you can customize it for a better user experience.",
    required:
        "If you make a field required, be aware that this will override any Broker configuration because the user won't be able to submit the form without entering a value.",
    includeOther:
        "If you have a component with 'options', this will allow them to enter their own custom value into an input field as normal text.",
    min: "The minimum value of the field. The system will enforce this minimum so only enter a value if you absolutely do not want anything less than this minimum.",
    max: "The maximum value of the field. The system will enforce this maximum so only enter a value if you absolutely do not want anything more than this maximum.",
    step: "This is primarily relevant for slider fields. It's the amount the slider will increment or decrement by when the user clicks the arrows or drags the slider.",
    rows: "This is primarily relevant for textareas and multiselect fields. It's the number of rows the textarea will see, but it does not impact the amount of text they can enter.\n\nIt's a good practice to play with the rows and watch the preview change to see what feels right for you.",
    minDate:
        "The minimum date of the field. The system will enforce this minimum so only enter a value if you absolutely do not want anything less than this minimum date.",
    maxDate:
        "The maximum date of the field. The system will enforce this maximum so only enter a value if you absolutely do not want anything more than this maximum date.",
    onLabel: "The default is 'Yes' but you can enter anything you wish to use such as True, On, Open, etc.",
    offLabel: "The default is 'No' but you can enter anything you wish to use such as False, Off, Closed, etc.",
    options:
        "This is perhaps the most useful and powerful feature for components. This will allow you to provide users with highly relevant options which can generate highly customized results depending on your workflow or recipe.\n\nYou can often capture a complex text input with this single value, but it's more work for you to set up.",
    width: "Controls the width of the field. It's best to leave this as full width, since your container will already establish the width, but there are times when this will be a valuable customization.",
    direction:
        "Controls the direction of the field. This is only relevant for fields that have multiple options, such as radio groups or checkboxes.",
    gridCols: "Controls the number of columns the field will use",
    spellCheck: "If you check this, the field will have spell check enabled",
    multiSelect: "If you check this, the field will allow multiple selections",
    showSelectAll: "If you check this, the field will show a 'Select All' option",
    minItems: "The minimum number of items the field will allow the user to select",
    maxItems: "The maximum number of items the field will allow the user to select",
    minLength: "The minimum number of characters the user can enter",
    maxLength: "The maximum number of characters the user can enter",
    minValue: "The minimum value the user can enter",
    maxValue: "The maximum value the user can enter",
    valuePrefix: "Optional text to display before the value (Examples: $100, @username, Item: 456, #12, Order #789, Anything: 123, etc.)",
    valueSuffix: "Optional text to display after the value (Examples: 100%, 500g, 12 Miles, 650 USD, 8hrs, 22°C, 5 items, 123 Anything, etc.)",
    autoComplete: "Browser autocomplete behavior for this field",
    customContent: "This is a more advanced feature that allows you to enter custom HTML content for the field.",
    disabled: "This will probably be removed. Why would you create a permanently disabled field?",
    dateFormat: "The format of the date the user can enter",
    timeFormat: "The format of the time the user can enter",
    timeZone: "The time zone of the date the user can enter",
    timeZoneOffset: "The time zone offset of the date the user can enter",
};

export const containerHelpTextItems = {
    properties: "Basic information about this container",
    label: "This will be the main identifier for your container",
    shortLabel:
        "A shorter name used in limited space contexts. In most cases, this is not necessary, but if you choose a small layout and have many containers, this can be helpful and will be automatically used.",
    hideDescription: "If you check this, the description will not be visible to the user.",
    helpText:
        "If you don't enter a value, it's perfectly fine. \nIf you enter any text, then the user will see an icon exactly like the one you just hovered and they will see exactly the same thing you're looking at now.",
    description:
        "The description is not always visible, depending on your chosen layout. It's a good practice to have one just in case, But the system is designed to work seamlessly without it.",
    fields: "The fields that are contained within this container.",
    permissions: "The permissions for this container",
    public: "If you check this, the container will be available for use in multiple apps.",
    authenticatedRead: "If you check this, the container will be available for use in multiple apps.",
    publicRead: "If you check this, the container will be available for use in multiple apps.",
};

export interface AppBuilderHelpTextProps {
    fieldName: string;
    fieldLabel?: string;
    required?: boolean;
}

export const FieldLabelAndHelpText = ({ fieldName, fieldLabel, required }: AppBuilderHelpTextProps) => {
    return (
        <div className="flex items-center gap-1">
            <Label htmlFor={fieldName} className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                {fieldLabel || fieldName}
                {required && <span className="pl-1 text-red-500">*</span>}
            </Label>
            <HelpIcon text={(fieldHelpTextItems as Record<string, string>)[fieldName]} />
        </div>
    );
};

export const ContainerLabelAndHelpText = ({ fieldName, fieldLabel, required }: AppBuilderHelpTextProps) => {
    return (
        <div className="flex items-center gap-1">
            <Label htmlFor={fieldName} className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                {fieldLabel || fieldName}
                {required && <span className="pl-1 text-red-500">*</span>}
            </Label>
            <HelpIcon text={(containerHelpTextItems as Record<string, string>)[fieldName]} />
        </div>
    );
};

// Enhanced CustomFieldLabelAndHelpText component
export interface CustomFieldLabelAndHelpTextProps {
    fieldId: string;
    fieldLabel: string;
    helpText?: string;
    required?: boolean;
    className?: string;
    onAiAssistance?: () => void;
    // New props
    showRequired?: boolean;
    showHelpText?: boolean;
    labelPosition?: "top" | "left" | "right";
}

export interface CustomFieldLabelAndHelpTextProps {
    fieldId: string;
    fieldLabel: string;
    helpText?: string;
    required?: boolean;
    className?: string;
    onAiAssistance?: () => void;
    // New props
    showRequired?: boolean;
    showHelpText?: boolean;
    labelPosition?: "top" | "left" | "right";
}

export const CustomFieldLabelAndHelpText = ({ 
    fieldId, 
    fieldLabel, 
    helpText, 
    required = false, 
    className = "", 
    onAiAssistance,
    // Default values for backward compatibility
    showRequired = true,
    showHelpText = true,
    labelPosition = "top"
}: CustomFieldLabelAndHelpTextProps) => {
    const handleAiAssistance = () => {
        console.log("AI Assistance");
        if (onAiAssistance) {
            onAiAssistance();
        }
    };

    // Top position (default) - vertical layout
    if (labelPosition === "top") {
        return (
            <div className={cn("flex items-center gap-1", className)}>
                <Label htmlFor={fieldId} className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                    {fieldLabel}
                    {required && showRequired && <span className="pl-1 text-red-500">*</span>}
                </Label>
                {showHelpText && helpText && (
                    <HelpIcon 
                        text={helpText} 
                        required={required} 
                        title={fieldLabel} 
                        onAiAssistance={handleAiAssistance}
                    />
                )}
            </div>
        );
    }
    
    // Left position - horizontal layout with label on left
    if (labelPosition === "left") {
        return (
            <div className={cn("flex items-center", className)}>
                <div className="flex items-center gap-1 min-w-[120px] mr-2">
                    <Label htmlFor={fieldId} className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                        {fieldLabel}
                        {required && showRequired && <span className="pl-1 text-red-500">*</span>}
                    </Label>
                    {showHelpText && helpText && (
                        <HelpIcon 
                            text={helpText} 
                            required={required} 
                            title={fieldLabel} 
                            onAiAssistance={handleAiAssistance}
                        />
                    )}
                </div>
            </div>
        );
    }
    
    // Right position - horizontal layout with label on right
    return (
        <div className={cn("flex items-center justify-between", className)}>
            <div className="flex-1"></div>
            <div className="flex items-center gap-1 min-w-[120px] ml-2 text-right">
                <Label htmlFor={fieldId} className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer text-right">
                    {fieldLabel}
                    {required && showRequired && <span className="pl-1 text-red-500">*</span>}
                </Label>
                {showHelpText && helpText && (
                    <HelpIcon 
                        text={helpText} 
                        required={required} 
                        title={fieldLabel} 
                        onAiAssistance={handleAiAssistance}
                    />
                )}
            </div>
        </div>
    );
};