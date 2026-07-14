import type { WebsiteClass, DomainState } from "../types";

const CLASS_LABEL: Record<WebsiteClass, string> = {
  NONE: "No website",
  SOCIAL_ONLY: "Social only",
  DIRECTORY_ONLY: "Directory only",
  PROPER_DEAD: "Dead site",
  PROPER: "Has website",
};

const CLASS_STYLE: Record<WebsiteClass, string> = {
  NONE: "badge grey",
  SOCIAL_ONLY: "badge amber",
  DIRECTORY_ONLY: "badge amber",
  PROPER_DEAD: "badge red",
  PROPER: "badge muted",
};

export function WebsiteClassBadge({ value }: { value: WebsiteClass }) {
  return <span className={CLASS_STYLE[value]}>{CLASS_LABEL[value]}</span>;
}

export function ScorePill({ value }: { value: number }) {
  const tier = value >= 70 ? "hot" : value >= 45 ? "warm" : "cool";
  return <span className={`score ${tier}`}>{value}</span>;
}

export function DomainBadge({ value, suggested }: { value: DomainState; suggested: string | null }) {
  if (!suggested) return <span className="badge muted">—</span>;
  const cls = value === "AVAILABLE" ? "badge green" : value === "TAKEN" ? "badge muted" : "badge grey";
  return (
    <span className={cls} title={suggested}>
      {value === "AVAILABLE" ? "✓ free" : value === "TAKEN" ? "taken" : "?"}
    </span>
  );
}
