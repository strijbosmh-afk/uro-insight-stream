import * as React from "react";
import { Switch } from "@/components/ui/switch";

/**
 * Tap-target wrapper for a Switch + label row.
 * The whole row is a button (≥56px tall). Tapping anywhere toggles.
 * The Switch's onClick stops propagation so a direct tap doesn't double-fire.
 */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      className="w-full min-h-14 px-1 py-3 flex items-center justify-between gap-4 text-left active:bg-panel-elevated/60 transition-colors disabled:opacity-60"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text-primary">{label}</div>
        {description && (
          <div className="text-[12px] text-text-muted mt-0.5">
            {description}
          </div>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
        disabled={disabled}
      />
    </button>
  );
}

export default SwitchRow;