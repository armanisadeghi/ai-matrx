// components/ui/Card.tsx
export function Card({ children, className = '', onClick }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) {
    return (
      <div 
        onClick={onClick}
        className={`p-4 rounded-lg border-2 transition-all duration-200 ${
          onClick ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/50' : ''
        } ${className}`}
      >
        {children}
      </div>
    );
  }
  
  // components/ui/StepHeader.tsx
  export function StepHeader({ title, description }: {
    title: string;
    description: string;
  }) {
    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    );
  }
  
  // components/ui/Button.tsx
  export function Button({ 
    children, 
    variant = 'primary',
    disabled = false,
    className = '',
    onClick 
  }: {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    className?: string;
    onClick?: () => void;
  }) {
    const baseStyles = "px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200";
    const variants = {
      primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400",
      secondary: "bg-textured border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:bg-gray-100 dark:disabled:bg-gray-900"
    };
  
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${baseStyles} ${variants[variant]} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {children}
      </button>
    );
  }
  
  // components/ui/Input.tsx
  export function Input({
    label,
    value,
    onChange,
    placeholder = '',
    className = ''
  }: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
  }) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-textured text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    );
  }