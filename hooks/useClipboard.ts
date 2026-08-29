// hooks/useClipboard.ts — HOST WIRING for @ai-matrx/kit/clipboard.
// All clipboard mechanics live in the package; this wrapper only injects the
// app's toast as the notifier (message becomes the toast title, errors render
// destructive — the original behavior, verbatim).
import { useToast } from '@/components/ui/use-toast';
import {
    useClipboard as useKitClipboard,
    type UseClipboardResult,
} from '@ai-matrx/kit/clipboard';

export type { UseClipboardResult };

export function useClipboard(): UseClipboardResult {
    const { toast } = useToast();
    return useKitClipboard({
        notify: (message, kind) =>
            toast(
                kind === 'error'
                    ? { title: message, variant: 'destructive' }
                    : { title: message },
            ),
    });
}
