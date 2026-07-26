"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AppListTable from "@/features/applet/builder/modules/app-builder/AppListTable";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteAppThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";

export default function AppsListPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const handleViewField = (id: string) => {
        router.push(`/apps/app-builder/apps/${id}`);
    };

    const handleEditField = (id: string) => {
        router.push(`/apps/app-builder/apps/${id}/edit`);
    };

    const handleCreateField = () => {
        router.push(`/apps/app-builder/apps/create`);
    };

    const handleDeleteField = async (id: string) => {
        try {
            await dispatch(deleteAppThunk(id)).unwrap();
            router.refresh();
        } catch (error) {
            console.error("Failed to delete app:", error);
        }
    };

    return (
        <AppListTable
            onAppView={handleViewField}
            onAppEdit={handleEditField}
            onAppCreate={handleCreateField}
            onAppDelete={handleDeleteField}
        />
    );
}

