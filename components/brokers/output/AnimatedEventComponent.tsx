"use client";

import React, { useState, useEffect } from "react";

type SectionItem = {
  name: string;
  description?: string;
};

type Section = {
  title: string;
  items: SectionItem[];
};

type Props = {
  sections: Section[];
};

const AnimatedEventComponent: React.FC<Props> = ({ sections }) => {
  const [visibleSections, setVisibleSections] = useState<number[]>([]);
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Show sections one by one with a delay
    sections.forEach((_, index) => {
      setTimeout(() => {
        setVisibleSections((prev) => [...prev, index]);

        // After a section appears, show its items one by one
        sections[index].items.forEach((item, itemIndex) => {
          setTimeout(() => {
            setVisibleItems(
              (prev) => new Set([...prev, `${index}-${itemIndex}`]),
            );
          }, itemIndex * 200); // 200ms delay between items
        });
      }, index * 600); // 600ms delay between sections
    });
  }, [sections]);

  return (
    <div className="w-full p-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.title}
            className={`
              bg-gradient-to-br from-pink-50 to-cyan-50 dark:from-pink-950 dark:to-cyan-950 
              border-2 border-pink-200 dark:border-pink-800 shadow-lg rounded-xl p-2
              transform transition-all duration-500 ease-out
              ${
                visibleSections.includes(sectionIndex)
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }
            `}
          >
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-cyan-400 dark:from-pink-400 dark:to-cyan-300 bg-clip-text text-transparent">
              {section.title}
            </h2>
            <ul className="mt-4 space-y-2">
              {section.items.map((item, itemIndex) => (
                <li
                  key={item.name}
                  className={`
                    p-2 rounded-lg bg-white dark:bg-black/20 shadow-sm 
                    border border-pink-100 dark:border-pink-700 
                    transform transition-all duration-300 ease-out
                    hover:scale-[1.02]
                    ${
                      visibleItems.has(`${sectionIndex}-${itemIndex}`)
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-2"
                    }
                  `}
                >
                  <h3 className="text-lg font-semibold text-pink-700 dark:text-pink-300">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-gray-700 dark:text-gray-300 mt-1">
                      {item.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnimatedEventComponent;
