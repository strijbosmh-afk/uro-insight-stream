import * as React from "react";

export function Sparkline({
  values,
  width = 220,
  height = 36,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const stepX = width / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} className="block overflow-visible">
      <polygon points={areaPoints} fill="hsl(var(--accent) / 0.12)" />
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default Sparkline;