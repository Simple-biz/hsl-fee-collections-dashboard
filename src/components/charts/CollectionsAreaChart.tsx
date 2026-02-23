"use client";

import { useTheme } from "next-themes";
import { fmt } from "@/lib/formatters";
import type { MonthlyData } from "@/types";

interface CollectionsAreaChartProps {
  data: MonthlyData[];
}

export const CollectionsAreaChart = ({ data }: CollectionsAreaChartProps) => {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const maxVal =
    Math.max(...data.map((v) => Math.max(v.expected, v.collected))) || 1;
  const w = 700,
    h = 220,
    px = 50,
    py = 20;
  const cw = w - px * 2,
    ch = h - py * 2;

  const toPath = (key: "expected" | "collected") =>
    data
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"} ${px + (i / (data.length - 1)) * cw} ${py + ch - (v[key] / maxVal) * ch}`,
      )
      .join(" ");

  const toArea = (key: "expected" | "collected") => {
    const pts = data
      .map(
        (v, i) =>
          `${px + (i / (data.length - 1)) * cw} ${py + ch - (v[key] / maxVal) * ch}`,
      )
      .join(" L ");
    return `M ${px} ${py + ch} L ${pts} L ${px + cw} ${py + ch} Z`;
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = py + ch - pct * ch;
        return (
          <g key={i}>
            <line
              x1={px}
              y1={y}
              x2={w - px}
              y2={y}
              stroke={dark ? "#262626" : "#f1f5f9"}
              strokeWidth="1"
            />
            <text
              x={px - 6}
              y={y + 3}
              textAnchor="end"
              fill={dark ? "#525252" : "#a3a3a3"}
              style={{ fontSize: 10 }}
            >
              {fmt(maxVal * pct)}
            </text>
          </g>
        );
      })}
      <path
        d={toArea("expected")}
        fill={dark ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.08)"}
      />
      <path
        d={toPath("expected")}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={toArea("collected")}
        fill={dark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.12)"}
      />
      <path
        d={toPath("collected")}
        fill="none"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {data.map((v, i) => {
        const x = px + (i / (data.length - 1)) * cw;
        return (
          <text
            key={i}
            x={x}
            y={h - 4}
            textAnchor="middle"
            fill={dark ? "#525252" : "#a3a3a3"}
            style={{ fontSize: 10 }}
          >
            {v.month}
          </text>
        );
      })}
      {data.map((v, i) => {
        const x = px + (i / (data.length - 1)) * cw;
        return (
          <g key={`d${i}`}>
            <circle
              cx={x}
              cy={py + ch - (v.expected / maxVal) * ch}
              r="3"
              fill="#6366f1"
            />
            <circle
              cx={x}
              cy={py + ch - (v.collected / maxVal) * ch}
              r="3"
              fill="#10b981"
            />
          </g>
        );
      })}
    </svg>
  );
};
