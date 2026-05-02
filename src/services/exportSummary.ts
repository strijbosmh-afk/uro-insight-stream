import type { Abstract, Congress, Session, Source, Summary } from "@/types";

export interface SummaryExportInput {
  summary: Summary;
  /** Title of the target — e.g. session title or abstract title. */
  title: string;
  congress?: Congress;
  session?: Session;
  abstract?: Abstract | null;
  /** Optional: top-N source quotes resolved to full Source rows for attribution. */
  sourceLookup?: Map<string, Source>;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}
function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** urofeed_<congressShortCode>_<sessionSlug>_<YYYYMMDD>.{pdf,md} */
export function buildExportFilename(
  input: SummaryExportInput,
  ext: "pdf" | "md",
) {
  const cong = input.congress?.shortCode ?? "urofeed";
  const slug = slugify(input.title || input.session?.title || "summary");
  const day = fmtDate(input.summary.generatedAt);
  return `urofeed_${slugify(cong)}_${slug}_${day}.${ext}`;
}

/* -------------------------- Markdown -------------------------- */

export function summaryToMarkdown(input: SummaryExportInput): string {
  const { summary, title, congress, session, abstract, sourceLookup } = input;
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  const meta: string[] = [];
  if (congress) meta.push(`**${congress.shortCode}** · ${congress.name}`);
  if (session)
    meta.push(
      `${session.track} · ${new Date(session.startTime).toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })} · ${session.room}`,
    );
  if (abstract?.abstractNumber) meta.push(`Abstract #${abstract.abstractNumber}`);
  if (meta.length) {
    lines.push(meta.join("  \n"));
    lines.push("");
  }
  lines.push(`> Generated ${new Date(summary.generatedAt).toISOString()} · model \`${summary.modelUsed}\` · ${summary.tweetCount} tweets · sentiment **${summary.sentiment}**`);
  lines.push("");

  lines.push("## Key takeaways");
  summary.bulletPoints.forEach((b, i) => lines.push(`${i + 1}. ${b}`));
  lines.push("");

  if (summary.keyQuotes.length) {
    lines.push("## Notable quotes");
    summary.keyQuotes.forEach((q) => {
      const src = sourceLookup?.get(q.sourceId);
      const handle = src?.handle?.replace(/^@/, "") ?? q.sourceId.replace(/^@/, "");
      lines.push(`> “${q.quote}”`);
      lines.push(`> — @${handle}${src?.displayName ? ` · ${src.displayName}` : ""}`);
      lines.push("");
    });
  }

  if (summary.controversies.length) {
    lines.push("## Controversies");
    summary.controversies.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  if (summary.takeaways.length) {
    lines.push("## Open questions");
    summary.takeaways.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  lines.push("---");
  lines.push(`Exported from UroFeed · ${new Date().toISOString()}`);
  return lines.join("\n");
}

export function downloadMarkdown(input: SummaryExportInput): void {
  const md = summaryToMarkdown(input);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, buildExportFilename(input, "md"));
}

/* ----------------------------- PDF ----------------------------- */

/**
 * Direct jsPDF text rendering — selectable, searchable text.
 * Lazy-loads jspdf on first call so the bundle stays slim.
 */
export async function downloadPdf(input: SummaryExportInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { summary, title, congress, session, abstract, sourceLookup } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const lineGap = 4;

  function ensureSpace(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function writeBlock(
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {},
  ) {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [30, 30, 30]));
    const lines = doc.splitTextToSize(text, contentW) as string[];
    for (const line of lines) {
      ensureSpace(size + lineGap);
      doc.text(line, margin, y);
      y += size + lineGap;
    }
    if (opts.gap) y += opts.gap;
  }

  function rule() {
    ensureSpace(8);
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
  }

  // Header
  writeBlock(title || "Summary", { size: 16, bold: true, color: [15, 23, 42], gap: 4 });
  const metaParts: string[] = [];
  if (congress) metaParts.push(`${congress.shortCode} · ${congress.name}`);
  if (session)
    metaParts.push(
      `${session.track} · ${new Date(session.startTime).toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })} · ${session.room}`,
    );
  if (abstract?.abstractNumber) metaParts.push(`Abstract #${abstract.abstractNumber}`);
  if (metaParts.length)
    writeBlock(metaParts.join("  ·  "), { size: 9, color: [90, 90, 90], gap: 6 });

  writeBlock(
    `Generated ${new Date(summary.generatedAt).toISOString()}  ·  model: ${summary.modelUsed}  ·  ${summary.tweetCount} tweets  ·  sentiment: ${summary.sentiment}`,
    { size: 8, color: [120, 120, 120], gap: 6 },
  );
  rule();

  // Key takeaways
  writeBlock("KEY TAKEAWAYS", { size: 9, bold: true, color: [60, 60, 60], gap: 4 });
  summary.bulletPoints.forEach((b, i) => {
    writeBlock(`${String(i + 1).padStart(2, "0")}.  ${b}`, { size: 10, gap: 2 });
  });
  y += 6;

  // Quotes
  if (summary.keyQuotes.length) {
    rule();
    writeBlock("NOTABLE QUOTES", { size: 9, bold: true, color: [60, 60, 60], gap: 4 });
    summary.keyQuotes.forEach((q) => {
      const src = sourceLookup?.get(q.sourceId);
      const handle = src?.handle?.replace(/^@/, "") ?? q.sourceId.replace(/^@/, "");
      writeBlock(`“${q.quote}”`, { size: 10, gap: 1 });
      writeBlock(`— @${handle}${src?.displayName ? `  ·  ${src.displayName}` : ""}`, {
        size: 9,
        color: [110, 110, 110],
        gap: 6,
      });
    });
  }

  // Controversies
  if (summary.controversies.length) {
    rule();
    writeBlock("CONTROVERSIES", { size: 9, bold: true, color: [60, 60, 60], gap: 4 });
    summary.controversies.forEach((c) => writeBlock(`•  ${c}`, { size: 10, gap: 2 }));
  }

  // Open questions
  if (summary.takeaways.length) {
    rule();
    writeBlock("OPEN QUESTIONS", { size: 9, bold: true, color: [60, 60, 60], gap: 4 });
    summary.takeaways.forEach((t) => writeBlock(`•  ${t}`, { size: 10, gap: 2 }));
  }

  // Footer
  rule();
  writeBlock(`Exported from UroFeed  ·  ${new Date().toISOString()}`, {
    size: 8,
    color: [140, 140, 140],
  });

  doc.save(buildExportFilename(input, "pdf"));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}