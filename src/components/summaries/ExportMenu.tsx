import * as React from "react";
import { Download, FileDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  downloadMarkdown,
  downloadPdf,
  type SummaryExportInput,
} from "@/services/exportSummary";

interface Props {
  /** Resolves the export input lazily — avoids paying lookup cost until clicked. */
  resolve: () => SummaryExportInput | Promise<SummaryExportInput>;
  size?: "sm" | "default";
  variant?: "default" | "ghost" | "outline";
  className?: string;
  /** Override label; defaults to "Export". */
  label?: string;
}

export function ExportMenu({
  resolve,
  size = "sm",
  variant = "outline",
  className,
  label = "Export",
}: Props) {
  const [busy, setBusy] = React.useState<"pdf" | "md" | null>(null);

  const onPick = async (kind: "pdf" | "md") => {
    setBusy(kind);
    try {
      const input = await resolve();
      if (kind === "md") {
        downloadMarkdown(input);
        toast.success("Markdown downloaded");
      } else {
        await downloadPdf(input);
        toast.success("PDF downloaded");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className ?? "h-8"}
          disabled={busy !== null}
          aria-label="Export summary"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {busy === "pdf" ? "Exporting PDF…" : busy === "md" ? "Exporting…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onPick("pdf")} className="gap-2">
          <FileDown className="w-3.5 h-3.5 text-accent" />
          <span className="text-[12px]">Download PDF</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPick("md")} className="gap-2">
          <FileText className="w-3.5 h-3.5 text-accent" />
          <span className="text-[12px]">Download Markdown</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportMenu;