"use client";
import React from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export enum plan {
    personal = "personal",
    teamLight = "teamLight",
    teamPro = "teamPro",
    Enterprise = "Enterprise",
}

export type Plan = {
    id: string;
    name: string;
    price: number | string;
    subText?: string;
    currency: string;
    features: string[];
    featured?: boolean;
    buttonText?: string;
    additionalFeatures?: string[];
    onClick: () => void;
};

const plans: Array<Plan> = [
    {
        id: plan.personal,
        name: "Personal",
        price: "Free",
        subText: "/month",
        currency: "$",
        features: [
            "Access to basic analytics reports",
            "Up to 10,000 data points per month",
            "Email support",
            "Community forum access",
            "Cancel anytime",
        ],
        buttonText: "Start Free",
        onClick: () => {
            console.log("Start Free");
        },
    },
    {
        id: plan.teamLight,
        name: "Team Light",
        price: 29,
        subText: "/month",
        currency: "$",
        featured: true,
        features: [
            "Advanced analytics dashboard",
            "Customizable reports and charts",
            "Real-time data tracking",
            "Integration with third-party old-tools",
        ],
        buttonText: "Get Team Light",
        additionalFeatures: ["Everything in Personal Plan"],
        onClick: () => {
            console.log("Get Team Light");
        },
    },
    {
        id: plan.teamPro,
        name: "Team Pro",
        price: 39,
        subText: "/month",
        currency: "$",
        features: [
            "Unlimited data storage",
            "Customizable dashboards",
            "Advanced data segmentation",
            "Real-time data processing",
            "AI-powered insights and recommendations",
        ],
        additionalFeatures: ["Everything in Team Light Plan"],
        buttonText: "Get Pro",
        onClick: () => {
            console.log("Get Pro");
        },
    },
    {
        id: plan.Enterprise,
        name: "Enterprise",
        price: "Custom",
        subText: "",
        currency: "",
        features: [
            "Unlimited data storage",
            "Customizable dashboards",
            "Advanced data segmentation",
            "Real-time data processing",
            "AI-powered insights and recommendations",
        ],
        additionalFeatures: ["Everything in Team Pro Plan"],
        buttonText: "Let's Talk",
        onClick: () => {
            console.log("Enterprise Plan - Let's Talk");
        },
    },

];


export function SimplePricingWithFourTiers() {
    return (
        <div className="relative isolate bg-transparent px-4 py-0 sm:py-10 lg:px-4 max-w-7xl mx-auto">
            <div
                className="absolute inset-x-0 -top-3 -z-10 transform-gpu overflow-hidden px-36 blur-3xl"
                aria-hidden="true"
            ></div>
            <>
                <h2 className="pt-4 font-bold text-lg md:text-4xl text-center text-neutral-800 dark:text-neutral-100">
                    Simple Pricing for Everyone
                </h2>
                <p className="max-w-md mx-auto text-base text-center text-neutral-600 dark:text-neutral-300 mt-4">
                    Our pricing offers individuals and developers a Free Forever plan and Team, Pro and Enterprise plans for teams of all sizes.
                </p>
            </>

            <div
                className={cn(
                    "mx-auto grid grid-cols-1 gap-4 mt-20",
                    "max-w-7xl mx-auto sm:grid-cols-2 lg:grid-cols-4"
                )}
            >
                {plans.map((tier) => (
                    <Card plan={tier} key={tier.id} onClick={tier.onClick} />
                ))}
            </div>
        </div>
    );
}



export function SimplePricingWithThreeTiers() {
    return (
        <div className="relative isolate bg-transparent px-4 py-0 sm:py-10 lg:px-4 max-w-7xl mx-auto">
            <div
                className="absolute inset-x-0 -top-3 -z-10 transform-gpu overflow-hidden px-36 blur-3xl"
                aria-hidden="true"
            ></div>
            <>
                <h2 className="pt-4 font-bold text-lg md:text-4xl text-center text-neutral-800 dark:text-neutral-100">
                    Simple Pricing for Everyone
                </h2>
                <p className="max-w-md mx-auto text-base text-center text-neutral-600 dark:text-neutral-300 mt-4">
                    Our pricing offers individuals and developers a Free Forever plan and Team, Pro and Enterprise plans for teams of all sizes.
                </p>
            </>

            <div
                className={cn(
                    "mx-auto grid grid-cols-1 gap-4  mt-20 ",
                    "max-w-7xl mx-auto  md:grid-cols-2 xl:grid-cols-3"
                )}
            >
                {plans.map((tier, tierIdx) => {
                    return <CardForThree plan={tier} key={tier.id} onClick={tier.onClick} />;
                })}
            </div>
        </div>
    );
}

const Card = ({ plan, onClick }: { plan: Plan; onClick: () => void }) => {
    return (
        <div
            className={cn(
                "p-1 sm:p-2 md:p-3 rounded-3xl bg-gray-50 dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800"
            )}
        >
            <div className="flex flex-col gap-4 h-full justify-start">
                <div
                    className={cn(
                        "p-3 bg-white dark:bg-neutral-800 rounded-2xl shadow-input w-full dark:shadow-[0px_-1px_0px_0px_var(--neutral-700)]"
                    )}
                >
                    <div className="flex justify-between items-start">
                        <div className="flex gap-2 flex-col">
                            <p
                                className={cn("font-medium text-base lg:text-lg text-black dark:text-white")}
                            >
                                {plan.name}
                            </p>
                        </div>

                        {plan.featured && (
                            <div
                                className={cn(
                                    "font-medium text-xs px-2 py-1 rounded-full relative bg-neutral-900 dark:bg-white dark:text-black text-white"
                                )}
                            >
                                <div className="absolute inset-x-0 bottom-0 w-3/4 mx-auto h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                                Featured
                            </div>
                        )}
                    </div>
                    <div className="mt-6">
                        <div className="flex items-end">
                            <span className={cn("text-base lg:text-lg font-bold text-neutral-500 dark:text-neutral-200")}>
                                {plan.currency}
                            </span>
                            <div className="flex items-start gap-1">
                                <span className={cn("text-2xl lg:text-3xl xl:text-5xl font-bold dark:text-neutral-50 text-neutral-800")}>
                                    {plan?.price}
                                </span>
                            </div>
                            <span className={cn("text-sm lg:text-base font-normal text-neutral-500 dark:text-neutral-200 mb-1")}>
                                {plan.subText}
                            </span>
                        </div>
                    </div>
                    <button
                        className={cn(
                            "w-full mt-6 mb-2 px-2 py-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-600 text-white font-medium text-sm"
                        )}
                        onClick={onClick}
                    >
                        {plan.buttonText}
                    </button>
                </div>
                <div className="mt-1 p-2 lg:p-3">
                    {plan.features.map((feature: string, idx: number) => (
                        <Step key={idx}>{feature}</Step>
                    ))}
                </div>
                {plan.additionalFeatures && plan.additionalFeatures.length > 0 && (
                    <Divider />
                )}
                <div className="p-2 lg:p-3">
                    {plan.additionalFeatures?.map((feature: string, idx: number) => (
                        <Step additional key={idx}>
                            {feature}
                        </Step>
                    ))}
                </div>
            </div>
        </div>
    );
};


const CardForThree = ({ plan, onClick }: { plan: Plan; onClick: () => void }) => {
    return (
        <div
            className={cn(
                "p-1 sm:p-4 md:p-4 rounded-3xl bg-gray-50 dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800"
            )}
        >
            <div className="flex flex-col gap-4 h-full justify-start">
                <div
                    className={cn(
                        "p-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-input w-full dark:shadow-[0px_-1px_0px_0px_var(--neutral-700)]"
                    )}
                >
                    <div className="flex justify-between items-start ">
                        <div className="flex gap-2 flex-col">
                            <p
                                className={cn("font-medium text-lg text-black dark:text-white")}
                            >
                                {plan.name}
                            </p>
                        </div>

                        {plan.featured && (
                            <div
                                className={cn(
                                    "font-medium text-xs px-3 py-1 rounded-full relative bg-neutral-900 dark:bg-white dark:text-black text-white"
                                )}
                            >
                                <div className="absolute inset-x-0 bottom-0 w-3/4 mx-auto h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                                Featured
                            </div>
                        )}
                    </div>
                    <div className="mt-8 ">
                        <div className="flex items-end">
              <span
                  className={cn(
                      "text-lg font-bold text-neutral-500 dark:text-neutral-200"
                  )}
              >
                {plan.currency}
              </span>
                            <div className="flex items-start gap-2">
                <span
                    className={cn(
                        "text-3xl md:text-7xl font-bold dark:text-neutral-50 text-neutral-800"
                    )}
                >
                  {plan?.price}
                </span>
                            </div>
                            <span
                                className={cn(
                                    "text-base font-normal text-neutral-500 dark:text-neutral-200 mb-1 md:mb-2"
                                )}
                            >
                {plan.subText}
              </span>
                        </div>
                    </div>
                    <button
                        className={cn(
                            "w-full md:w-full mt-10 mb-4 px-2 py-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-600 text-white font-medium"
                        )}
                        onClick={onClick}
                    >
                        {plan.buttonText}
                    </button>
                </div>
                <div className="mt-1 p-4">
                    {plan.features.map((feature, idx) => (
                        <StepForThree key={idx}>{feature}</StepForThree>
                    ))}
                </div>
                {plan.additionalFeatures && plan.additionalFeatures.length > 0 && (
                    <Divider />
                )}
                <div className="p-4">
                    {plan.additionalFeatures?.map((feature, idx) => (
                        <StepForThree additional key={idx}>
                            {feature}
                        </StepForThree>
                    ))}
                </div>
            </div>
        </div>
    );
};

const Step = ({
                  children,
                  additional,
              }: {
    children: React.ReactNode;
    additional?: boolean;
    featured?: boolean;
}) => {
    return (
        <div className="flex items-start justify-start gap-2 my-3">
            <div
                className={cn(
                    "h-4 w-4 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0 mt-0.5",
                    additional ? "bg-sky-500" : "bg-neutral-700"
                )}
            >
                <IconCheck className="h-3 w-3 [stroke-width:4px] text-neutral-300" />
            </div>
            <div className={cn("font-medium text-black text-xs lg:text-sm dark:text-white")}>
                {children}
            </div>
        </div>
    );
};


const StepForThree = ({
                  children,
                  additional,
              }: {
    children: React.ReactNode;
    additional?: boolean;
    featured?: boolean;
}) => {
    return (
        <div className="flex items-start justify-start gap-2 my-4">
            <div
                className={cn(
                    "h-4 w-4 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0 mt-0.5",
                    additional ? "bg-sky-500" : "bg-neutral-700"
                )}
            >
                <IconCheck className="h-3 w-3 [stroke-width:4px] text-neutral-300" />
            </div>
            <div className={cn("font-medium text-black text-sm dark:text-white")}>
                {children}
            </div>
        </div>
    );
};

const Divider = () => {
    return (
        <div className="relative">
            <div className={cn("w-full h-px dark:bg-neutral-950 bg-white")} />
            <div className={cn("w-full h-px bg-neutral-200 dark:bg-neutral-800")} />
            <div
                className={cn(
                    "absolute inset-0 h-5 w-5 m-auto rounded-xl dark:bg-neutral-800 bg-white shadow-[0px_-1px_0px_0px_var(--neutral-200)] dark:shadow-[0px_-1px_0px_0px_var(--neutral-700)] flex items-center justify-center"
                )}
            >
                <IconPlus
                    className={cn(
                        "h-3 w-3 [stroke-width:4px] dark:text-neutral-300 text-black"
                    )}
                />
            </div>
        </div>
    );
};
