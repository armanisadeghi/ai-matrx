// FlexForm.tsx
import React, {useState, useRef} from "react";
import {AnimatePresence, motion} from "motion/react";
import {cn} from "@/styles/themes/utils";
import {Input} from "@/components/ui/input";
import {FlexFormField, FormState} from '@/types/componentConfigTypes';
import AnimatedButton from "../AnimatedButton";
import {FlexDensity, FlexField} from "./FlexField";
import FlexManager from "./FlexManager";

const densityConfig: Record<FlexDensity, {
    wrapper: string;
    searchSpacing: string;
    contentSpacing: string;
    buttonSpacing: string;
    stepIndicatorSpacing: string;
    headingSize: string;
}> = {
    compact: {
        wrapper: "p-2 space-y-3",
        searchSpacing: "mb-2",
        contentSpacing: "space-y-3",
        buttonSpacing: "mt-3",
        stepIndicatorSpacing: "mt-2",
        headingSize: "text-lg"
    },
    normal: {
        wrapper: "p-4 space-y-4",
        searchSpacing: "mb-4",
        contentSpacing: "space-y-4",
        buttonSpacing: "mt-6",
        stepIndicatorSpacing: "mt-4",
        headingSize: "text-xl"
    },
    comfortable: {
        wrapper: "p-6 space-y-6",
        searchSpacing: "mb-6",
        contentSpacing: "space-y-6",
        buttonSpacing: "mt-8",
        stepIndicatorSpacing: "mt-6",
        headingSize: "text-2xl"
    }
};

interface FlexFormProps {
    fields: FlexFormField[];
    formState: FormState;
    onUpdateField: (name: string, value: unknown) => void;
    onSubmit: () => void;
    currentStep?: number;
    onNextStep?: () => void;
    onPrevStep?: () => void;
    isSinglePage?: boolean;
    className?: string;
    isFullPage?: boolean;
    columns?: number | 'auto' | { xs: number, sm: number, md: number, lg: number, xl: number };
    layout?: 'grid' | 'sections' | 'accordion' | 'tabs' | 'masonry' | 'carousel' | 'timeline';
    enableSearch?: boolean;
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    density?: FlexDensity;
}

const FlexForm: React.FC<FlexFormProps> = (
    {
        fields,
        formState,
        onUpdateField,
        onSubmit,
        currentStep: externalCurrentStep,
        onNextStep: externalOnNextStep,
        onPrevStep: externalOnPrevStep,
        isSinglePage = false,
        className,
        isFullPage = false,
        columns = 1,
        layout = 'grid',
        enableSearch = false,
        direction = 'row',
        density = 'normal',
        ...props
    }) => {
    const [internalCurrentStep, setInternalCurrentStep] = useState(0);
    const currentStep = externalCurrentStep !== undefined ? externalCurrentStep : internalCurrentStep;
    const formRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);
    const styles = densityConfig[density];

    const internalOnNextStep = () => {
        setInternalCurrentStep((prevStep) => Math.min(prevStep + 1, fields.length - 1));
    };

    const internalOnPrevStep = () => {
        setInternalCurrentStep((prevStep) => Math.max(prevStep - 1, 0));
    };

    const onNextStep = externalOnNextStep || internalOnNextStep;
    const onPrevStep = externalOnPrevStep || internalOnPrevStep;

    const filteredFields = enableSearch
                           ? fields.filter(field =>
            field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            field.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
                           : fields;

    return (
        <motion.div
            ref={formRef}
            className={cn(
                "bg-card rounded-lg",
                isFullPage ? "w-full h-full" : "max-w-md mx-auto mt-4 shadow-xl",
                styles.wrapper,
                className
            )}
            initial={{opacity: 0, scale: isFullPage ? 0.98 : 0.9}}
            animate={{opacity: 1, scale: 1}}
            transition={{duration: 0.5}}
            {...props}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                }}
                className={styles.contentSpacing}
            >
                {enableSearch && (
                    <Input
                        type="text"
                        placeholder="Search fields..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchSpacing}
                    />
                )}

                <div className={cn(isFullPage ? "h-[calc(100%-4rem)] overflow-y-auto" : "")}>
                    {isSinglePage ? (
                        <FlexManager
                            layout={layout}
                            fields={filteredFields}
                            formState={formState}
                            onUpdateField={onUpdateField}
                            columns={columns}
                            direction={direction}
                            carouselActiveIndex={carouselActiveIndex}
                            onCarouselChange={setCarouselActiveIndex}
                            density={density}
                            enableSearch={enableSearch}
                            searchTerm={searchTerm}
                        />
                    ) : (
                         <>
                             <motion.h2
                                 className={cn(
                                     "font-bold text-foreground mb-4",
                                     styles.headingSize,
                                     isFullPage ? "text-3xl" : ""
                                 )}
                                 initial={{opacity: 0, y: -20}}
                                 animate={{opacity: 1, y: 0}}
                                 transition={{delay: 0.2, duration: 0.5}}
                             >
                                 {fields[currentStep].label}
                             </motion.h2>

                             <AnimatePresence mode="wait">
                                 <motion.div
                                     key={currentStep}
                                     initial={{opacity: 0, x: 50}}
                                     animate={{opacity: 1, x: 0}}
                                     exit={{opacity: 0, x: -50}}
                                     transition={{duration: 0.3}}
                                 >
                                     <FlexField
                                         field={fields[currentStep]}
                                         formState={formState}
                                         onUpdateField={onUpdateField}
                                         density={density}
                                     />
                                 </motion.div>
                             </AnimatePresence>
                         </>
                     )}
                </div>

                <motion.div
                    className={cn("flex justify-between", styles.buttonSpacing)}
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{delay: 0.3, duration: 0.5}}
                >
                    {!isSinglePage && (
                        <AnimatedButton
                            onClick={() => {
                                if (currentStep > 0) onPrevStep();
                            }}
                            disabled={currentStep === 0}
                            className="bg-secondary text-secondary-foreground"
                        >
                            Previous
                        </AnimatedButton>
                    )}
                    {isSinglePage || currentStep === fields.length - 1 ? (
                        <AnimatedButton
                            type="submit"
                            className="bg-primary text-primary-foreground"
                            size={density === 'compact' ? 'sm' : density === 'comfortable' ? 'lg' : 'default'}
                        >
                            Submit
                        </AnimatedButton>
                    ) : (
                         <AnimatedButton
                             onClick={() => {
                                 if (currentStep < fields.length - 1) onNextStep();
                             }}
                             className="bg-primary text-primary-foreground"
                             size={density === 'compact' ? 'sm' : density === 'comfortable' ? 'lg' : 'default'}
                         >
                             Next
                         </AnimatedButton>
                     )}
                </motion.div>
            </form>

            {!isSinglePage && (
                <motion.div
                    className={cn(
                        "text-muted-foreground",
                        styles.stepIndicatorSpacing,
                        density === 'compact' ? 'text-xs' : density === 'comfortable' ? 'text-base' : 'text-sm'
                    )}
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    transition={{delay: 0.5, duration: 0.5}}
                >
                    Step {currentStep + 1} of {fields.length}
                </motion.div>
            )}
        </motion.div>
    );
};

export default FlexForm;
