import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky bottom save bar for mobile settings pages.
 * Sits ABOVE the BottomTabBar (60px + safe-area-inset-bottom).
 * Hidden on md+ — desktop keeps its inline Save button.
 */
export function MobileSaveBar({
  visible,
  saving,
  onSave,
  onCancel,
  saveLabel = "Save changes",
}: {
  visible: boolean;
  saving: boolean;
  onSave: () => void | Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  if (!visible) return null;
  return (
    <div
      className="md:hidden fixed left-0 right-0 z-30 px-3 py-3 bg-bg/95 backdrop-blur border-t border-border"
      style={{
        bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="flex gap-2 max-w-xl mx-auto">
        <Button
          onClick={() => void onSave()}
          disabled={saving}
          className="flex-1 h-12"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saveLabel}
        </Button>
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
            className="h-12 px-4"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default MobileSaveBar;