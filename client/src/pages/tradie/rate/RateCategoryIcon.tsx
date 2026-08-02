/** One glyph per price-book category — spanner, box, person, phone, dots. */

type Props = { category: string; size?: number };

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function RateCategoryIcon({ category, size = 20 }: Props) {
  const p = svgProps(size);
  switch (category.toUpperCase()) {
    case "MATERIAL":
      return (
        <svg {...p}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "LABOUR":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "CALLOUT":
      return (
        <svg {...p}>
          <path d="M5 4h4l1.5 4-2 1.5a12 12 0 0 0 6 6L16 13.5l4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "OTHER":
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      );
    default:
      // SERVICE — a spanner, the closest thing to "a job done"
      return (
        <svg {...p}>
          <path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.2L4 16.6a2 2 0 1 0 2.8 2.8l5.1-5.1a4.2 4.2 0 0 0 5.2-5.6l-2.6 2.6-2.4-.7-.7-2.4 2.6-2.6z" />
        </svg>
      );
  }
}
