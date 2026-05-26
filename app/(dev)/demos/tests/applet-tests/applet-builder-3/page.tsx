import AppletBuilder from './components/AppletBuilder';

export default function Page() {
  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <AppletBuilder />
      </div>
    </div>
  );
}
