/** Shared UI primitives for the tradie app — icons, status pills, empty states. */

type IconProps = { size?: number };

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

export const IconJobs = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.2L4 16.6a2 2 0 1 0 2.8 2.8l5.1-5.1a4.2 4.2 0 0 0 5.2-5.6l-2.6 2.6-2.4-.7-.7-2.4 2.6-2.6z" />
  </svg>
);

export const IconQuotes = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const IconInvoices = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M5 3h14v18l-2.4-1.6L14.2 21l-2.2-1.6L9.8 21l-2.4-1.6L5 21z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

export const IconCustomers = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4" />
    <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
  </svg>
);

export const IconRates = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M12.6 3H20v7.4L11.4 19a2 2 0 0 1-2.8 0L4 14.4a2 2 0 0 1 0-2.8z" />
    <circle cx="16" cy="7" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSettings = ({ size = 22 }: IconProps) => (
  <svg {...svgProps(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" />
  </svg>
);

export const IconChevron = ({ size = 18 }: IconProps) => (
  <svg {...svgProps(size)} className="t-chevron">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconPhone = ({ size = 15 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M5 4h4l1.5 4-2 1.5a12 12 0 0 0 6 6L16 13.5l4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </svg>
);

export const IconInbox = ({ size = 34 }: IconProps) => (
  <svg {...svgProps(size)}>
    <path d="M4 4h16v16H4z" opacity="0" />
    <path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
  </svg>
);

const PILL_TONES: Record<string, string> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  PAID: "green",
  ACTIVE: "green",
  ROUTED: "blue",
  DECLINED: "red",
  OVERDUE: "red",
  FAILED: "red",
  SUSPENDED: "red",
  PAST_DUE: "red",
  EXPIRED: "grey",
  VOID: "grey",
  DELETED: "grey",
  HELD: "amber",
  TRIAL: "amber",
};

export function StatusPill({ status }: { status: string }) {
  const tone = PILL_TONES[status] ?? "slate";
  const label = status.replace(/_/g, " ").toLowerCase();
  return <span className={`t-pill t-pill--${tone}`}>{label}</span>;
}

export function initialsOf(name: string): string {
  return (
    name
      .replace(/\[SEED\]\s*/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "TM"
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="t-empty">
      <IconInbox />
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}
