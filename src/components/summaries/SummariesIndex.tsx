import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowUpDown, FileText } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { feedService } from "@/services/feedService";
import { cn } from "@/lib/utils";
import type { Summary, Session, Abstract, Congress } from "@/types";

type EnrichedSummary = Summary & {
  title: string;
  context?: string;
  navTarget?:
    | { kind: "session"; sessionId: string }
    | { kind: "congress"; congressId: string };
};

const SENTIMENT_STYLE: Record<Summary["sentiment"], string> = {
  positive: "border-success/40 text-success bg-success/10",
  mixed: "border-warning/40 text-warning bg-warning/10",
  critical: "border-danger/40 text-danger bg-danger/10",
  neutral: "border-border text-text-muted bg-panel-elevated",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SummariesIndex() {
  const navigate = useNavigate();
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<"all" | Summary["targetType"]>("all");
  const [sentiment, setSentiment] = React.useState<"all" | Summary["sentiment"]>(
    "all",
  );
  const [sortBy, setSortBy] = React.useState<"recent" | "tweets">("recent");

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["all-summaries"],
    queryFn: () => feedService.listSummaries(),
  });
  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });

  // Resolve titles for each summary's target.
  const sessionIdsNeeded = React.useMemo(
    () =>
      Array.from(
        new Set(
          summaries.filter((s) => s.targetType === "session").map((s) => s.targetId),
        ),
      ),
    [summaries],
  );
  const abstractIdsNeeded = React.useMemo(
    () =>
      Array.from(
        new Set(
          summaries
            .filter((s) => s.targetType === "abstract")
            .map((s) => s.targetId),
        ),
      ),
    [summaries],
  );

  // Pull sessions + abstracts via the per-congress lists so we cover everything.
  const allSessionsQ = useQuery({
    queryKey: ["all-sessions", congresses.map((c) => c.id).join(",")],
    enabled: congresses.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        congresses.map((c) => feedService.listSessions(c.id)),
      );
      return lists.flat();
    },
  });
  const allSessions: Session[] = allSessionsQ.data ?? [];

  const allAbstractsQ = useQuery({
    queryKey: [
      "all-abstracts-needed",
      allSessions.map((s) => s.id).join(","),
    ],
    enabled: allSessions.length > 0 && abstractIdsNeeded.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        allSessions.map((s) => feedService.listAbstracts(s.id)),
      );
      return lists.flat();
    },
  });
  const allAbstracts: Abstract[] = allAbstractsQ.data ?? [];

  const sessionMap = React.useMemo(
    () => new Map(allSessions.map((s) => [s.id, s])),
    [allSessions],
  );
  const abstractMap = React.useMemo(
    () => new Map(allAbstracts.map((a) => [a.id, a])),
    [allAbstracts],
  );
  const congressMap = React.useMemo(
    () => new Map(congresses.map((c) => [c.id, c])),
    [congresses],
  );

  const enriched: EnrichedSummary[] = React.useMemo(() => {
    return summaries.map((s) => {
      if (s.targetType === "session") {
        const sess = sessionMap.get(s.targetId);
        const cong = sess ? congressMap.get(sess.congressId) : undefined;
        return {
          ...s,
          title: sess?.title ?? s.targetId,
          context: cong ? `${cong.shortCode} · ${sess?.track ?? ""}` : undefined,
          navTarget: sess
            ? { kind: "session" as const, sessionId: sess.id }
            : undefined,
        };
      }
      if (s.targetType === "abstract") {
        const abs = abstractMap.get(s.targetId);
        const sess = abs ? sessionMap.get(abs.sessionId) : undefined;
        const cong = sess ? congressMap.get(sess.congressId) : undefined;
        return {
          ...s,
          title: abs?.title ?? s.targetId,
          context: cong
            ? `${cong.shortCode} · ${abs?.abstractNumber ?? ""}`
            : undefined,
          navTarget: sess
            ? { kind: "session" as const, sessionId: sess.id }
            : undefined,
        };
      }
      // congress
      const cong = congressMap.get(s.targetId);
      return {
        ...s,
        title: cong?.name ?? s.targetId,
        context: cong?.city,
        navTarget: cong
          ? { kind: "congress" as const, congressId: cong.id }
          : undefined,
      };
    });
  }, [summaries, sessionMap, abstractMap, congressMap]);

  const filtered = React.useMemo(() => {
    let out = enriched;
    if (type !== "all") out = out.filter((s) => s.targetType === type);
    if (sentiment !== "all")
      out = out.filter((s) => s.sentiment === sentiment);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      out = out.filter(
        (s) =>
          s.title.toLowerCase().includes(k) ||
          (s.context ?? "").toLowerCase().includes(k) ||
          s.bulletPoints.some((b) => b.toLowerCase().includes(k)),
      );
    }
    out = [...out].sort((a, b) => {
      if (sortBy === "tweets") return b.tweetCount - a.tweetCount;
      return a.generatedAt < b.generatedAt ? 1 : -1;
    });
    return out;
  }, [enriched, type, sentiment, q, sortBy]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3">
      <Panel
        title={
          <span>
            Summaries
            <span className="text-text-muted font-normal normal-case tracking-normal">
              {" "}
              · {filtered.length} of {enriched.length}
            </span>
          </span>
        }
        actions={
          <span className="text-[10px] font-mono text-text-muted px-1">
            AI-generated
          </span>
        }
        loading={isLoading}
        className="flex-1 min-h-0"
        bodyClassName="overflow-y-auto"
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search title, takeaway, congress…"
              className="pl-7 h-8 text-[12px]"
            />
          </div>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              <SelectItem value="session">Sessions</SelectItem>
              <SelectItem value="abstract">Abstracts</SelectItem>
              <SelectItem value="congress">Congresses</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sentiment}
            onValueChange={(v) => setSentiment(v as typeof sentiment)}
          >
            <SelectTrigger className="h-8 w-[140px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any sentiment</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-[150px] text-[12px]">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="tweets">Most tweets</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-24 text-[10px]">Target</TableHead>
              <TableHead className="text-[10px]">Title</TableHead>
              <TableHead className="w-28 text-[10px]">Sentiment</TableHead>
              <TableHead className="w-20 text-[10px] text-right">Tweets</TableHead>
              <TableHead className="w-40 text-[10px]">Generated</TableHead>
              <TableHead className="w-40 text-[10px]">Model</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => {
              const onOpen = () => {
                if (!s.navTarget) return;
                if (s.navTarget.kind === "session") {
                  navigate({
                    to: "/sessions/$sessionId",
                    params: { sessionId: s.navTarget.sessionId },
                  });
                } else {
                  navigate({
                    to: "/congresses/$congressId",
                    params: { congressId: s.navTarget.congressId },
                  });
                }
              };
              return (
                <TableRow
                  key={s.id}
                  className={cn(
                    "border-border",
                    s.navTarget && "cursor-pointer hover:bg-panel-elevated/50",
                  )}
                  onClick={s.navTarget ? onOpen : undefined}
                >
                  <TableCell className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {s.targetType}
                    </span>
                  </TableCell>
                  <TableCell className="text-[12px] text-text-primary">
                    <div className="line-clamp-1">{s.title}</div>
                    {s.context && (
                      <div className="text-[10px] font-mono text-text-muted mt-0.5">
                        {s.context}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center h-5 px-2 rounded-[2px] border text-[10px] font-mono uppercase tracking-wider",
                        SENTIMENT_STYLE[s.sentiment],
                      )}
                    >
                      {s.sentiment}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-[12px] font-mono text-accent">
                    {s.tweetCount}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-text-muted">
                    {fmt(s.generatedAt)}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-text-muted">
                    {s.modelUsed}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && !isLoading && (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-[12px] font-mono text-text-muted"
                >
                  no summaries match the current filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

export default SummariesIndex;