import LoadingSpinner from "@/components/ui/loading-spinner";

// export default function MatrxMiniLoader() {
//   return (
//     <div className="flex flex-col items-center gap-1">
//       <h2 className="text-sm font-light text-blue-600 dark:text-blue-400 tracking-wider">
//         Initializing Matrx<span className="animate-pulse">...</span>
//       </h2>

//       {/* Progress bar */}
//       <div className="w-36 h-0.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
//         <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 animate-progress shadow-lg shadow-blue-500/50 dark:shadow-blue-400/30" />
//       </div>

//       <style jsx>{`
//         @keyframes progress {
//           0% {
//             transform: translateX(-100%);
//           }
//           100% {
//             transform: translateX(400%);
//           }
//         }

//         .animate-progress {
//           animation: progress 2s ease-in-out infinite;
//         }
//       `}</style>
//     </div>
//   );
// }
export default function MatrxMiniLoader() {
  return (
    <LoadingSpinner variant="dots" message="Initializing Matrx..." size="md" />
  );
}
