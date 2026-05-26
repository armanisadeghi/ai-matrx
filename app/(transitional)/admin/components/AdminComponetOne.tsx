import React, { useState } from "react";
import useSampleData from "@/app/(transitional)/admin/hooks/useSampleData";
import { Button } from "@/components/ui/button";
import GenericSelect from "@/app/(transitional)/admin/components/GenericSelect";

const adminActions = [
    "Add User",
    "Remove User",
    "Update Permissions",
    "View Logs",
    "System Settings"
];

const AdminComponentOne = () => {
    const [selectedAction, setSelectedAction] = useState<string | null>(null);
    const [newData, setNewData] = useState('');
    const { loading, error, data } = useSampleData("userManagement");

    const handleAdminActionSelect = (action: string) => {
        setSelectedAction(action);
    };

    const handleCreate = () => {
        if (selectedAction) {
            try {
                const parsedData = JSON.parse(newData);
                console.log(`Creating with action: ${selectedAction}`, parsedData);

            } catch (e) {
                console.error('Invalid JSON format', e);
            }
        }
    };

    return (
        <div className="space-y-4">
            <GenericSelect
                options={adminActions}
                onSelect={handleAdminActionSelect}
                selectedValue={selectedAction}
                label="Select Administrative Action"
                placeholder="Choose an action"
            />
            <textarea
                className="w-full p-2 border rounded"
                placeholder="New Data (JSON format)"
                value={newData}
                onChange={(e) => setNewData(e.target.value)}
            />
            <Button onClick={handleCreate} disabled={loading || !selectedAction}>
                Create
            </Button>
            {loading && <p>Loading...</p>}
            {error && <p className="text-red-500">Error: {error.message}</p>}
            {data && <p className="text-green-500">Fetched Data: {JSON.stringify(data)}</p>}
        </div>
    );
};

export default AdminComponentOne;
