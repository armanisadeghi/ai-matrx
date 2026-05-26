// components/BrokerForm.tsx
"use client";

import { brokerSelectors, BrokerIdentifier, brokerActions, useServerBrokerSync } from "@/lib/redux/brokerSlice";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { SLACK_BROKER_IDS } from "./BrokerSlackClient";


interface BrokerFormConfig {
    fields: {
        broker: BrokerIdentifier;
        label: string;
        type: "text" | "password" | "textarea" | "number";
        required?: boolean;
    }[];
    onSubmit: (values: Record<string, any>) => Promise<void>;
    brokerSync?: boolean;
}

export function BrokerForm({ fields, onSubmit, brokerSync = true }: BrokerFormConfig) {
    const dispatch = useAppDispatch();

    // Get all field values
    const values = useAppSelector((state) => {
        const fieldValues: Record<string, any> = {};
        fields.forEach((field) => {
            const key = JSON.stringify(field.broker);
            fieldValues[key] = brokerSelectors.selectValue(state, field.broker as any);
        });
        return fieldValues;
    });

    // Sync to server if enabled
    if (brokerSync) {
        useServerBrokerSync({
            brokers: fields.map((f) => f.broker),
            syncOnChange: true,
        });
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const submitValues: Record<string, any> = {};
        fields.forEach((field) => {
            const key = JSON.stringify(field.broker);
            submitValues[field.label] = values[key];
        });

        await onSubmit(submitValues);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field, index) => {
                const key = JSON.stringify(field.broker);
                const value = values[key] || "";

                return (
                    <div key={index} className="space-y-1">
                        <label className="text-slate-800 dark:text-slate-200">{field.label}:</label>
                        {field.type === "textarea" ? (
                            <textarea
                                value={value as string}
                                onChange={(e) =>
                                    dispatch(
                                        brokerActions.setText({
                                            idArgs: field.broker,
                                            text: e.target.value,
                                        })
                                    )
                                }
                                required={field.required}
                                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 w-full rounded-md focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                            />
                        ) : (
                            <input
                                type={field.type}
                                value={field.type === "number" ? (value as number) : (value as string)}
                                onChange={(e) => {
                                    if (field.type === "number") {
                                        const numValue = Number(e.target.value);
                                        dispatch(
                                            brokerActions.setNumber({
                                                idArgs: field.broker,
                                                value: numValue,
                                            })
                                        );
                                    } else {
                                        dispatch(
                                            brokerActions.setText({
                                                idArgs: field.broker,
                                                text: e.target.value,
                                            })
                                        );
                                    }
                                }}
                                required={field.required}
                                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2 w-full rounded-md focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                            />
                        )}
                    </div>
                );
            })}

            <button 
                type="submit" 
                className="bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors"
            >
                Submit
            </button>
        </form>
    );
}

export function BrokerFormExample() {
    // Get token to check if authenticated
    const token = useAppSelector(state => 
        brokerSelectors.selectText(state, SLACK_BROKER_IDS.token)
    );
    
    // Don't show the example if not authenticated
    if (!token) {
        return (
            <div className="p-6 bg-white dark:bg-slate-900 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-200">Slack Messages with Brokers</h2>
                <p className="text-slate-600 dark:text-slate-400">Please connect your Slack account first to use this feature.</p>
            </div>
        );
    }
    
    return (
        <div className="p-6 bg-white dark:bg-slate-900 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-200">Slack Messages with Brokers</h2>
            <BrokerForm
                fields={[
                    { broker: SLACK_BROKER_IDS.selectedChannel, label: "Channel", type: "text", required: true },
                    { broker: SLACK_BROKER_IDS.title, label: "Title", type: "text" },
                    { broker: SLACK_BROKER_IDS.initialComment, label: "Message", type: "textarea", required: true },
                ]}
                onSubmit={async (values) => {
                    console.log("Form submitted with broker values", values);
                    alert("Message submitted! Check console for values.");
                }}
            />
        </div>
    );
}
