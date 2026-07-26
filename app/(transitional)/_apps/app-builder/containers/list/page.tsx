"use client";

import React from "react";
import { useRouter } from "next/navigation";
import ContainerListTable from "@/features/applet/builder/modules/container-builder/ContainerListTable";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";

export default function ContainersListPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();

    const handleViewContainer = (id: string) => {
        router.push(`/apps/app-builder/containers/${id}`);
    };

    const handleEditContainer = (id: string) => {
        router.push(`/apps/app-builder/containers/${id}/edit`);
    };

    const handleCreateContainer = () => {
        router.push(`/apps/app-builder/containers/create`);
    };

    const handleDeleteContainer = async (id: string) => {
        try {
            await dispatch(deleteContainerThunk(id)).unwrap();
            router.refresh();
        } catch (error) {
            console.error("Failed to delete container:", error);
        }
    };

    return (
        <ContainerListTable
            onContainerView={handleViewContainer}
            onContainerEdit={handleEditContainer}
            onContainerCreate={handleCreateContainer}
            onContainerDelete={handleDeleteContainer}
        />
    );
}
