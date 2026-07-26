"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { brokerActions } from "@/lib/redux/brokerSlice";

/**
 * Hook to lazily request user's geolocation when needed.
 * This avoids triggering the browser permission popup on app load.
 * 
 * @returns A function that requests geolocation and updates the Redux store
 * 
 * @example
 * ```tsx
 * const requestGeolocation = useGeolocation();
 * 
 * // Call when you actually need location
 * const handleNeedLocation = async () => {
 *   const coords = await requestGeolocation();
 *   if (coords) {
 *     console.log(coords.latitude, coords.longitude);
 *   }
 * };
 * ```
 */
export function useGeolocation() {
    const dispatch = useAppDispatch();
    
    const requestGeolocation = useCallback((): Promise<{ latitude: number; longitude: number } | null> => {
        return new Promise((resolve) => {
            if (typeof window === 'undefined' || !navigator.geolocation) {
                dispatch(
                    brokerActions.setValue({
                        brokerId: "GLOBAL_USER_COORDINATES",
                        value: null,
                    })
                );
                resolve(null);
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const coords = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    };
                    
                    dispatch(
                        brokerActions.setValue({
                            brokerId: "GLOBAL_USER_COORDINATES",
                            value: coords,
                        })
                    );
                    
                    resolve(coords);
                },
                (error) => {
                    console.warn("Geolocation unavailable:", error);
                    dispatch(
                        brokerActions.setValue({
                            brokerId: "GLOBAL_USER_COORDINATES",
                            value: null,
                        })
                    );
                    resolve(null);
                }
            );
        });
    }, [dispatch]);
    
    return requestGeolocation;
}
