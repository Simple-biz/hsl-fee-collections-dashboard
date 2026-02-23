interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const Sparkline = ({
  data,
  color = "#10b981",
  width = 80,
  height = 32,
}: SparklineProps) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`,
    )
    .join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill={`${color}15`}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
