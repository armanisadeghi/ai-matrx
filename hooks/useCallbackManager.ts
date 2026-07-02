import { callbackManager, type CallbackContext } from '@/utils/callbackManager';
import { useState, useEffect } from 'react';

interface CallbackData<T> {
    result: T;
}

type CustomPromise<T> = Promise<T> & {
    callbackId?: string;
};

export function useCallbackManager<T = unknown>() {
    const [callbackId, setCallbackId] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            if (callbackId) {
                callbackManager.remove(callbackId);
            }
        };
    }, [callbackId]);

    const createCallback = () => {
        let id: string | undefined;

        const promise = new Promise<T>((resolve, reject) => {
            id = callbackManager.registerWithContext((data: CallbackData<T>, context?: CallbackContext) => {
                if (context?.progress?.status === 'error') {
                    reject(context.progress.error);
                } else if (context?.progress?.status === 'completed') {
                    resolve(data.result);
                }
            });

            setCallbackId(id);
        }) as CustomPromise<T>;

        // The Promise executor above runs synchronously, so `id` is always
        // assigned by this point.
        promise.callbackId = id;
        return promise;
    };

    return createCallback;
}