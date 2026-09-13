/**
 * Lightweight inline-SVG trend line. No charting library — not justified for a
 * single trend glyph; add one only if a later round needs real interactive charts.
 */
export function Sparkline({
  data,
  width,
  height = 30,
  stroke = 'currentColor',
  strokeWidth = 2.2,
  className,
}: {
  data: number[];
  /** Pixel width for the SVG attribute. Omit and size via className (e.g. "w-full") instead. */
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = 100 / (data.length - 1);
  const points = data
    .map((value, index) => {
      const x = index * stepX;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
