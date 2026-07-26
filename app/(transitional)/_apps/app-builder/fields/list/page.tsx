"use client";

import React from "react";
import { useRouter } from "next/navigation";
import FieldListTable from "@/features/applet/builder/modules/field-builder/FieldListTable";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteFieldThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";

export default function FieldsListPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const handleViewField = (id: string) => {
        router.push(`/apps/app-builder/fields/${id}`);
    };

    const handleEditField = (id: string) => {
        router.push(`/apps/app-builder/fields/${id}/edit`);
    };

    const handleCreateField = () => {
        router.push(`/apps/app-builder/fields/create`);
    };

    const handleDeleteField = async (id: string) => {
        try {
            await dispatch(deleteFieldThunk(id)).unwrap();
            router.refresh();
        } catch (error) {
            console.error("Failed to delete field:", error);
        }
    };

    return (
        <FieldListTable
            onFieldView={handleViewField}
            onFieldEdit={handleEditField}
            onFieldCreate={handleCreateField}
            onFieldDelete={handleDeleteField}
        />
    );
}
