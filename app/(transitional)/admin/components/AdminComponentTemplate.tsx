import React from "react";
import GenericSelect from "@/app/(transitional)/admin/components/GenericSelect";
import useSampleData from "../hooks/useSampleData";

const adminActions = [
    "Add User",
    "Remove User",
    "Update Permissions",
    "View Logs",
    "System Settings"
];

const AdminPageTemplate = ({ type, label }: { type: string; label: string }) => {
    const { loading, error, data } = useSampleData(type as any);

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-bold">{label}</h2>
            <GenericSelect
                options={adminActions}
                onSelect={(action) => console.log(`Action selected: ${action}`)}
                selectedValue={null}
                label="Select Administrative Action"
                placeholder="Choose an action"
            />
            {loading && <p>Loading...</p>}
            {error && <p className="text-red-500">Error: {error.message}</p>}
            {data && <pre className="p-2 bg-gray-100 rounded">{JSON.stringify(data, null, 2)}</pre>}
        </div>
    );
};

// Wrapper Components for Each Page Type
export const UserManagementPage = () => <AdminPageTemplate type="userManagement" label="User Management" />;
export const FileSystemManagementPage = () => <AdminPageTemplate type="fileSystemManagement" label="File System Management" />;
export const LogsManagementPage = () => <AdminPageTemplate type="logsManagement" label="Logs Management" />;
export const DebugConsolePage = () => <AdminPageTemplate type="debugConsole" label="Debug Console" />;
export const LinkManagementPage = () => <AdminPageTemplate type="linkManagement" label="Link Management" />;
