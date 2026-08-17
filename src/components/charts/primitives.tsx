"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Measure the container so charts can be drawn in real pixels.
 *
 * Scaling a fixed viewBox would scale stroke widths with it, and the mark specs
 * (2px lines, a 2px surface gap between fills, ≥8px hit targets) are absolute.
 */
export function useMeasure<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => setWidth(node.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/* ── tooltip ─────────────────────────────────────────────────────────────── */

export type TooltipState = {
  x: number;
  y: number;
  content: ReactNode;
} | null;

export function useTooltip() {
  const [tip, setTip] = useState<TooltipState>(null);
  const show = useCallback(
    (x: number, y: number, content: ReactNode) => setTip({ x, y, content }),
    [],
  );
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

/**
 * Positioned inside a `relative` chart wrapper. Flips horizontally near the
 * right edge so it never runs off the card.
 */
export function ChartTooltip({
  tip,
  containerWidth,
}: {
  tip: TooltipState;
  containerWidth: number;
}) {
  if (!tip) return null;

  const width = 260;
  const flip = tip.x + width + 20 > containerWidth;
  const left = flip ? tip.x - width - 12 : tip.x + 12;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-lg border border-[var(--hairline-strong)] bg-[var(--surface-1)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]"
      style={{
        left: Math.max(4, left),
        top: Math.max(4, tip.y - 12),
        width,
        boxShadow: "var(--shadow-pop)",
      }}
    >
      {tip.content}
    </div>
  );
}

export function TooltipRow({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
        {color && (
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
          />
        )}
        {label}
      </span>
      <span className="tabular font-semibold text-[var(--ink-1)]">{value}</span>
    </div>
  );
}

/* ── legend ──────────────────────────────────────────────────────────────── */

export type LegendItem = {
  label: string;
  color: string;
  /** Rendered right of the label — a count, a share, whatever the chart shows. */
  value?: string;
  /** For the rolling-mean line: draw a dash instead of a dot. */
  shape?: "dot" | "line";
};

/** Present for every chart with two or more series — identity is never colour alone. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]"
        >
          {item.shape === "line" ? (
            <span
              aria-hidden
              className="h-0.5 w-4 shrink-0 rounded-full"
              style={{ background: item.color }}
            />
          ) : (
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: item.color }}
            />
          )}
          <span>{item.label}</span>
          {item.value && (
            <span className="tabular font-semibold text-[var(--ink-1)]">
              {item.value}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── table fallback ──────────────────────────────────────────────────────── */

/**
 * Every chart ships a table view. It is the accessibility backstop, and it is
 * also the relief for the palette slots that sit below 3:1 against the light
 * surface — the numbers are always readable even when a hue is not.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[11px] font-medium text-[var(--ink-3)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--ink-1)]"
      >
        {open ? "Hide data table" : "Show data table"}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--hairline)]">
          <table className="w-full border-collapse text-[11px]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-[var(--surface-2)]">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="border-b border-[var(--hairline)] px-2.5 py-1.5 text-left font-semibold text-[var(--ink-2)]"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="odd:bg-[var(--surface-2)]/40">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`border-b border-[var(--hairline)] px-2.5 py-1.5 text-[var(--ink-2)] ${
                        typeof cell === "number" ? "tabular text-right" : ""
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Rounded only on the end away from the baseline, per the mark spec. */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  direction: "up" | "down" | "right",
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (height <= 0 || width <= 0) return "";

  if (direction === "up") {
    return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
  }
  if (direction === "down") {
    return `M${x},${y} L${x},${y + height - r} Q${x},${y + height} ${x + r},${y + height} L${x + width - r},${y + height} Q${x + width},${y + height} ${x + width},${y + height - r} L${x + width},${y} Z`;
  }
  // right
  const rr = Math.max(0, Math.min(radius, height / 2, width));
  return `M${x},${y} L${x + width - rr},${y} Q${x + width},${y} ${x + width},${y + rr} L${x + width},${y + height - rr} Q${x + width},${y + height} ${x + width - rr},${y + height} L${x},${y + height} Z`;
}
