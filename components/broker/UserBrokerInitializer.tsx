"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { brokerActions } from "@/lib/redux/brokerSlice";
import { UserData } from "@/utils/userDataMapper";
import { useSetGlobalBasics } from "@/hooks/brokers/useSetGlobalBasics";

interface GlobalBrokersInitializerProps {
    user: UserData;
}

  


export function GlobalBrokersInitializer({ user }: GlobalBrokersInitializerProps) {
    const dispatch = useAppDispatch();

    useSetGlobalBasics();

    useEffect(() => {
        if (!user?.id) return;

        dispatch(
            brokerActions.setValue({
                brokerId: "GLOBAL_USER_OBJECT",
                value: user,
            })
        );

        dispatch(
            brokerActions.setValue({
                brokerId: "GLOBAL_USER_ID",
                value: user.id,
            })
        );

        const userName = user.userMetadata?.fullName || user.userMetadata?.name || user.userMetadata?.preferredUsername || user.email;

        dispatch(
            brokerActions.setValue({
                brokerId: "GLOBAL_USER_NAME",
                value: userName,
            })
        );

        const profileImage = user.userMetadata?.avatarUrl || user.userMetadata?.picture || null;

        dispatch(
            brokerActions.setValue({
                brokerId: "GLOBAL_USER_PROFILE_IMAGE",
                value: profileImage,
            })
        );

        // Use admin status from user object (already determined from database in layout)
        dispatch(
            brokerActions.setValue({
                brokerId: "GLOBAL_USER_IS_ADMIN",
                value: user.isAdmin,
            })
        );
        
    }, [dispatch, user]);

    return null;
}
