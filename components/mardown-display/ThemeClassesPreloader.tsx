import { THEMES } from './themes';
import { APPLET_THEMES } from '@/components/applet/reusable-sections/applet-themes';
/**
 * A hidden component that ensures all theme classes are included in the Tailwind build
 */
const ThemeClassesPreloader = () => {
  // Extract all classes from themes object
  const allClasses: string[] = [];
  
  // Recursively find all string values (classes) in the themes object
  const extractClasses = (obj) => {
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Split space-separated classes and add each one
        value.split(' ').forEach(cls => {
          if (cls && !allClasses.includes(cls)) {
            allClasses.push(cls);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        extractClasses(value);
      }
    }
  };
  
  extractClasses(THEMES);
  extractClasses(APPLET_THEMES);
  return (
    <div className="hidden" aria-hidden="true">
      {allClasses.map((cls, index) => (
        <span key={index} className={cls}></span>
      ))}
    </div>
  );
};

export default ThemeClassesPreloader;