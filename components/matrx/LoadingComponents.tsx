// components/matrx/LoadingComponents.tsx

import React from 'react';
import { ChevronRight, Folder, File } from 'lucide-react';

// Small Component Loading
export const SmallComponentLoading: React.FC = () => (
    <div className="w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-pulse flex space-x-4">
            <div className="rounded-full bg-slate-200 h-10 w-10"></div>
            <div className="flex-1 space-y-6 py-1">
                <div className="h-2 bg-slate-200 rounded"></div>
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-2 bg-slate-200 rounded col-span-2"></div>
                        <div className="h-2 bg-slate-200 rounded col-span-1"></div>
                    </div>
                    <div className="h-2 bg-slate-200 rounded"></div>
                </div>
            </div>
        </div>
    </div>
);

// Medium Component Loading
export const MediumComponentLoading: React.FC = () => (
    <div className="w-full h-full flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="space-y-2">
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="h-20 bg-slate-200 rounded col-span-1"></div>
                <div className="h-20 bg-slate-200 rounded col-span-2"></div>
            </div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
        </div>
    </div>
);

// Large Component Loading
export const LargeComponentLoading: React.FC = () => (
    <div className="w-full h-full flex items-center justify-center p-8">
        <div className="w-full max-w-lg animate-pulse space-y-6">
            <div className="h-6 bg-slate-200 rounded w-2/3"></div>
            <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded w-4/5"></div>
            </div>
            <div className="grid grid-cols-2 gap-6">
                <div className="h-32 bg-slate-200 rounded"></div>
                <div className="h-32 bg-slate-200 rounded"></div>
            </div>
            <div className="space-y-3">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
            </div>
        </div>
    </div>
);

// Full Page Loading
export const FullPageLoading: React.FC = () => (
    <div className="w-full h-dvh flex items-center justify-center p-8">
        <div className="w-full max-w-4xl animate-pulse space-y-8">
            <div className="h-8 bg-slate-200 rounded w-1/2"></div>
            <div className="space-y-4">
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            </div>
            <div className="grid grid-cols-3 gap-8">
                <div className="h-64 bg-slate-200 rounded"></div>
                <div className="h-64 bg-slate-200 rounded"></div>
                <div className="h-64 bg-slate-200 rounded"></div>
            </div>
            <div className="space-y-4">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            </div>
            <div className="h-12 bg-slate-200 rounded w-1/4"></div>
        </div>
    </div>
);

// Text Loading
export const TextLoading: React.FC = () => (
    <div className="w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg animate-pulse space-y-2">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded"></div>
            <div className="h-4 bg-slate-200 rounded w-5/6"></div>
            <div className="h-4 bg-slate-200 rounded w-2/3"></div>
        </div>
    </div>
);

// Card Loading
export const CardLoading: React.FC = () => (
    <div className="w-full h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border-border shadow animate-pulse">
            <div className="flex items-center justify-center h-48 mb-4 bg-gray-300 rounded">
                <svg className="w-12 h-12 text-gray-200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor" viewBox="0 0 640 512">
                    <path d="M480 80C480 35.82 515.8 0 560 0C604.2 0 640 35.82 640 80C640 124.2 604.2 160 560 160C515.8 160 480 124.2 480 80zM0 456.1C0 445.6 2.964 435.3 8.551 426.4L225.3 81.01C231.9 70.42 243.5 64 256 64C268.5 64 280.1 70.42 286.8 81.01L412.7 281.7L460.9 202.7C464.1 196.1 472.2 192 480 192C487.8 192 495 196.1 499.1 202.7L631.1 419.1C636.9 428.6 640 439.7 640 450.9C640 484.6 612.6 512 578.9 512H55.91C25.03 512 .0006 486.1 .0006 456.1L0 456.1z" />
                </svg>
            </div>
            <div className="p-5 space-y-4">
                <div className="h-4 bg-gray-200 rounded-full w-48 mb-4"></div>
                <div className="h-2 bg-gray-200 rounded-full max-w-[360px] mb-2.5"></div>
                <div className="h-2 bg-gray-200 rounded-full mb-2.5"></div>
                <div className="h-2 bg-gray-200 rounded-full max-w-[330px] mb-2.5"></div>
                <div className="h-2 bg-gray-200 rounded-full max-w-[300px] mb-2.5"></div>
                <div className="h-2 bg-gray-200 rounded-full max-w-[360px]"></div>
                <div className="flex items-center mt-4 space-x-3">
                    <div className="w-20 h-8 bg-gray-200 rounded-full"></div>
                    <div className="w-24 h-8 bg-gray-200 rounded-full"></div>
                </div>
            </div>
        </div>
    </div>
);

export const TableLoadingComponent = () => {
    return (
        <div className="w-full bg-gray-900 text-gray-200 p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <div className="w-1/3 h-10 bg-gray-700 rounded animate-pulse"></div>
                <div className="flex space-x-2">
                    <div className="w-24 h-10 bg-gray-700 rounded animate-pulse"></div>
                    <div className="w-24 h-10 bg-gray-700 rounded animate-pulse"></div>
                </div>
            </div>
            <div className="w-full overflow-x-auto">
                <table className="w-full">
                    <thead>
                    <tr>
                        {[...Array(7)].map((_, index) => (
                            <th key={index} className="p-2 text-left">
                                <div className="w-full h-6 bg-gray-700 rounded animate-pulse"></div>
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {[...Array(10)].map((_, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-gray-700">
                            {[...Array(7)].map((_, cellIndex) => (
                                <td key={cellIndex} className="p-2">
                                    <div className="w-full h-6 bg-gray-700 rounded animate-pulse"></div>
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-between items-center mt-4">
                <div className="w-24 h-10 bg-gray-700 rounded animate-pulse"></div>
                <div className="flex space-x-2">
                    {[...Array(2)].map((_, index) => (
                        <div key={index} className="w-10 h-10 bg-gray-700 rounded animate-pulse"></div>
                    ))}
                </div>
                <div className="w-24 h-10 bg-gray-700 rounded animate-pulse"></div>
            </div>
        </div>
    );
};

export const MatrxTableLoading: React.FC = () => {
    return (
        <div className="p-3 space-y-4 animate-pulse">
            {/* Top section */}
            <div className="flex justify-between items-center mb-4">
                <div className="w-1/3 h-10 bg-gray-700 rounded"></div>
                <div className="flex space-x-2">
                    <div className="w-24 h-10 bg-gray-700 rounded"></div>
                    <div className="w-24 h-10 bg-gray-700 rounded"></div>
                </div>
            </div>

            {/* Table */}
            <div className="relative overflow-hidden shadow-md sm:rounded-lg">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-hidden border rounded-xl bg-matrxBorder">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    {[...Array(5)].map((_, index) => (
                                        <th key={index} className="px-6 py-3">
                                            <div className="h-4 bg-gray-600 rounded"></div>
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody>
                                {[...Array(10)].map((_, rowIndex) => (
                                    <tr key={rowIndex} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                                        {[...Array(5)].map((_, cellIndex) => (
                                            <td key={cellIndex} className="px-6 py-4">
                                                <div className="h-4 bg-gray-600 rounded"></div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom section */}
            <div className="flex justify-between items-center mt-4">
                <div className="w-24 h-10 bg-gray-700 rounded"></div>
                <div className="flex space-x-2">
                    {[...Array(5)].map((_, index) => (
                        <div key={index} className="w-10 h-10 bg-gray-700 rounded"></div>
                    ))}
                </div>
                <div className="w-24 h-10 bg-gray-700 rounded"></div>
            </div>
        </div>
    );
};

// Form Loading (Half-Page Version)
export const FormLoadingSingleColumn: React.FC = () => (
    <div className="w-full h-[50dvh] flex items-center justify-center p-8">
        <div className="w-full max-w-2xl animate-pulse space-y-8">
            {/* Title Placeholder */}
            <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>

            {/* Input Field Placeholders */}
            {[...Array(6)].map((_, index) => (
                <div key={index} className="space-y-3">
                    <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                    <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                </div>
            ))}

            {/* Multi-Column Field Placeholder */}
            <div className="grid grid-cols-2 gap-4 space-y-3">
                {[...Array(2)].map((_, index) => (
                    <div key={index}>
                        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                        <div className="h-12 bg-input rounded"></div>
                    </div>
                ))}
            </div>

            {/* Button Placeholder */}
            <div className="flex justify-end mt-8">
                <div className="w-36 h-10 bg-primary rounded"></div>
            </div>
        </div>
    </div>
);

// Form Loading (Two-Column Half-Page Version)
export const FormLoadingTwoColumn: React.FC = () => (
    <div className="w-full h-[50dvh] flex items-center justify-center p-8">
        <div className="w-full max-w-4xl animate-pulse space-y-8">
            {/* Title Placeholder */}
            <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-2 gap-8">
                {/* Column 1 */}
                <div className="space-y-6">
                    {[...Array(4)].map((_, index) => (
                        <div key={index} className="space-y-3">
                            <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                            <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                        </div>
                    ))}
                </div>

                {/* Column 2 */}
                <div className="space-y-6">
                    {[...Array(4)].map((_, index) => (
                        <div key={index} className="space-y-3">
                            <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                            <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                        </div>
                    ))}
                </div>
            </div>

            {/* Button Placeholder */}
            <div className="flex justify-end mt-8">
                <div className="w-36 h-10 bg-primary rounded"></div>
            </div>
        </div>
    </div>
);


export const SidebarLoading: React.FC = () => (
    <div className="flex gap-2 items-center p-4">
        <div className="w-full max-w-2xl animate-pulse space-y-8">

        {[...Array(3)].map((_, index) => (
                <div key={index} className="space-y-3">
                    <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                    <div className="h-4 bg-primary rounded w-1/2 mb-2"></div>
                    <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                </div>
            ))}

            <div className="grid grid-cols-1 gap-4 space-y-3">
                {[...Array(2)].map((_, index) => (
                    <div key={index}>
                        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                        <div className="h-12 bg-input rounded"></div>
                    </div>
                ))}
            </div>
            {[...Array(3)].map((_, index) => (
                <div key={index} className="space-y-3">
                    <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                    <div className="h-4 bg-primary rounded w-1/2 mb-2"></div>
                    <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                </div>
            ))}

            <div className="grid grid-cols-1 gap-4 space-y-3">
                {[...Array(2)].map((_, index) => (
                    <div key={index}>
                        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                        <div className="h-12 bg-input rounded"></div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const EmptySidebar: React.FC = () => (
    <div className="flex gap-2 items-center p-4">
        <div className="w-full max-w-2xl space-y-8">

        {[...Array(1)].map((_, index) => (
                <div key={index} className="space-y-3">
                    <div className="h-4 bg-muted rounded w-1/4"></div> {/* Label Placeholder */}
                    <div className="h-4 bg-primary rounded w-1/2 mb-2"></div>
                    <div className="h-12 bg-input rounded"></div> {/* Input Field Placeholder */}
                </div>
            ))}

        </div>
    </div>
);
