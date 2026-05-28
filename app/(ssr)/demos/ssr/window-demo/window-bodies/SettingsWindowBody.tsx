"use client";

const SETTINGS_ROWS = [
  { label: "Theme", value: "System" },
  { label: "Language", value: "English" },
  { label: "Notifications", value: "Enabled" },
  { label: "Auto-save", value: "On" },
];

export function SettingsWindowBody() {
  return (
    <div className="p-4 space-y-4 h-full overflow-auto">
      {SETTINGS_ROWS.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between py-2 border-b border-border/50"
        >
          <span className="text-sm text-foreground/70">{item.label}</span>
          <span className="text-sm font-medium text-primary">{item.value}</span>
        </div>
      ))}
      <div className="pt-2">
        <div className="text-xs text-muted-foreground mb-2">Window opacity</div>
        <input
          type="range"
          min={50}
          max={100}
          defaultValue={95}
          className="w-full accent-primary"
        />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-2">Snap threshold</div>
        <input
          type="range"
          min={5}
          max={50}
          defaultValue={20}
          className="w-full accent-primary"
        />
      </div>
    </div>
  );
}
