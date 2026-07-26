// File Location: @/app/(transitional)/apps/app-builder/applets/list/page.tsx

"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AppletListTable from "@/features/applet/builder/modules/applet-builder/AppletListTable";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteAppletThunk } from "@/lib/redux/app-builder/thunks/appletBuilderThunks";

export default function AppsListPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const handleViewField = (id: string) => {
        router.push(`/apps/app-builder/applets/${id}`);
    };

    const handleEditField = (id: string) => {
        router.push(`/apps/app-builder/applets/${id}/edit`);
    };

    const handleCreateField = () => {
        router.push(`/apps/app-builder/applets/create`);
    };

    const handleDeleteField = async (id: string) => {
        try {
            await dispatch(deleteAppletThunk(id)).unwrap();
            router.refresh();
        } catch (error) {
            console.error("Failed to delete applet:", error);
        }
    };

    return (
        <AppletListTable
            onAppletView={handleViewField}
            onAppletEdit={handleEditField}
            onAppletCreate={handleCreateField}
            onAppletDelete={handleDeleteField}
        />
    );
}