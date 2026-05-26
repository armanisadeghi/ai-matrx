import React from 'react';

const TailwindDemo = () => {
    return (
        <div className="p-8 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <h1 className="text-4xl font-bold mb-6 text-center text-blue-600 dark:text-blue-400">Tailwind CSS Demo (Light/Dark)</h1>

            {/* Padding and Margin */}
            <div className="bg-textured rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4">Padding and Margin</h2>
                <div className="space-y-4">
                    <div className="bg-blue-100 dark:bg-blue-900 p-4">p-4: Padding on all sides</div>
                    <div className="bg-green-100 dark:bg-green-900 px-4 py-2">px-4 py-2: Horizontal and vertical padding</div>
                    <div className="bg-red-100 dark:bg-red-900 mt-4 mb-2 ml-8">mt-4 mb-2 ml-8: Margin top, bottom, and left</div>
                </div>
            </div>

            {/* Colors */}
            <div className="bg-textured rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4">Colors</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-500 dark:bg-blue-700 text-white p-2">Background blue</div>
                    <div className="bg-green-500 dark:bg-green-700 text-white p-2">Background green</div>
                    <div className="bg-yellow-200 dark:bg-yellow-600 text-yellow-800 dark:text-yellow-100 p-2">Yellow background, contrasting text</div>
                    <div className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 p-2">Purple background, contrasting text</div>
                </div>
            </div>

            {/* Typography */}
            <div className="bg-textured rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4">Typography</h2>
                <p className="text-sm mb-2">text-sm: Small text</p>
                <p className="text-base mb-2">text-base: Base text size</p>
                <p className="text-lg mb-2">text-lg: Large text</p>
                <p className="text-xl font-bold mb-2">text-xl font-bold: Extra large, bold</p>
                <p className="italic mb-2">italic: Italicized text</p>
                <p className="underline mb-2">underline: Underlined text</p>
                <p className="line-through">line-through: Strikethrough text</p>
            </div>

            {/* Flexbox and Grid */}
            <div className="bg-textured rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4">Flexbox and Grid</h2>
                <div className="flex justify-between items-center mb-4 bg-gray-200 dark:bg-gray-700 p-4">
                    <div className="bg-red-300 dark:bg-red-700 p-2">Flex item 1</div>
                    <div className="bg-green-300 dark:bg-green-700 p-2">Flex item 2</div>
                    <div className="bg-blue-300 dark:bg-blue-700 p-2">Flex item 3</div>
                </div>
                <div className="grid grid-cols-3 gap-4 bg-gray-200 dark:bg-gray-700 p-4">
                    <div className="bg-purple-300 dark:bg-purple-700 p-2">Grid item 1</div>
                    <div className="bg-yellow-300 dark:bg-yellow-700 p-2">Grid item 2</div>
                    <div className="bg-pink-300 dark:bg-pink-700 p-2">Grid item 3</div>
                </div>
            </div>

            {/* Responsive Design */}
            <div className="bg-textured rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-2xl font-semibold mb-4">Responsive Design</h2>
                <div className="bg-indigo-200 dark:bg-indigo-900 p-4 mb-4 sm:w-1/2 md:w-1/3 lg:w-1/4">
                    Responsive width: full on mobile, 1/2 on sm, 1/3 on md, 1/4 on lg
                </div>
                <div className="text-center text-lg md:text-xl lg:text-2xl">
                    Responsive text size: large, extra large on md, 2xl on lg
                </div>
            </div>

            {/* Hover and Focus States */}
            <div className="bg-textured rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-semibold mb-4">Hover and Focus States</h2>
                <button className="bg-blue-500 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white font-bold py-2 px-4 rounded mr-4">
                    Hover me
                </button>
                <input
                    type="text"
                    placeholder="Focus me"
                    className="border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 rounded-md p-2 bg-white dark:bg-gray-700"
                />
            </div>
        </div>
    );
};

export default TailwindDemo;
