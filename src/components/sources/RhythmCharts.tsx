// Recharts is ~90 KB gzipped; pulling it into the (already large)
// source-spotlight route's main chunk made the route feel sluggish on
// first navigation. Extracting the chart pair into its own file lets
// the parent `React.lazy(...)` split it into its own chunk that only
// loads when this panel is actually rendered.
import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";

export type RhythmDatum = { hour?: number; day?: string; count: number };

export function RhythmCharts({
  hourlyData,
  dowData,
}: {
  hourlyData: RhythmDatum[];
  dowData: RhythmDatum[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
          Hour of day (UTC)
        </div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis hide />
              <ReTooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  background: "hsl(var(--panel))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 11,
                }}
                formatter={(v: number) => [`${v} posts`, ""]}
                labelFormatter={(h: number) =>
                  `${String(h).padStart(2, "0")}:00 UTC`
                }
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--accent))"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
          Day of week
        </div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dowData}>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <ReTooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  background: "hsl(var(--panel))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 11,
                }}
                formatter={(v: number) => [`${v} posts`, ""]}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--accent))"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default RhythmCharts;
