// Simple usage in a component

import { WakeWordDebug } from "@/components/voice/wake-word/WakeWordDebug";

// Debug/admin usage
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/voice/wake-word-debug", {
  title: "Voice Wake Word Debug",
  description: "Interactive demo: Voice Wake Word Debug. AI Matrx demo route.",
});

export default function AdminPage() {
    return <WakeWordDebug />;
}


// // Simple usage in a component
// function MyComponent() {
//     return <WakeWordIndicator minimal />;
// }
//
// // Usage with specific wake words
// function AnotherComponent() {
//     return (
//         <WakeWordIndicator
//             wakeWords={[WAKE_WORDS.HEY_MATRIX]}
//             onDetected={(word) => {
//                 console.log(`Detected: ${word.displayName}`);
//             }}
//         />
//     );
// }
//
// // Debug/admin usage
// function AdminPage() {
//     return <WakeWordDebug />;
// }
