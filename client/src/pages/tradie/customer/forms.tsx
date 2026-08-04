import type { ReactNode } from "react";
import {
  CONTACT_ROLES,
  OCCUPANCIES,
  type ContactRole,
  type Occupancy,
} from "../../../api/customers";

/**
 * Form fragments shared by the add flow (sheet 2) and the edit screens (sheet 3).
 *
 * They're the same fields, so they're the same code — the wireframes differ only
 * in what surrounds them. Keeping one copy is what stops "property type" being a
 * dropdown when you add and a text box when you edit.
 */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="t-field">
      {label}
      {children}
    </label>
  );
}

export function ChipPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  allowClear = false,
}: {
  label?: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowClear?: boolean;
}) {
  return (
    <>
      {label && <p className="t-field-label">{label}</p>}
      <div className="t-chip-row t-chip-row--wrap">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              className={`t-chip${on ? " is-active" : ""}`}
              onClick={() => onChange(on && allowClear ? null : o.id)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="t-toggle-row">
      <span>
        <strong>{label}</strong>
        {hint && <span className="muted-text">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function RolePicker({ value, onChange }: { value: ContactRole; onChange: (v: ContactRole) => void }) {
  return (
    <ChipPicker
      label="Role"
      options={CONTACT_ROLES}
      value={value}
      onChange={(v) => v && onChange(v)}
    />
  );
}

export function OccupancyPicker({
  value,
  onChange,
}: {
  value: Occupancy | null;
  onChange: (v: Occupancy | null) => void;
}) {
  return <ChipPicker label="Occupancy" options={OCCUPANCIES} value={value} onChange={onChange} allowClear />;
}

/** UK property types a domestic tradie actually meets. */
export const PROPERTY_TYPES = [
  "House (Detached)",
  "House (Semi-detached)",
  "House (Terraced)",
  "House (End terrace)",
  "Bungalow",
  "Flat (Purpose built)",
  "Flat (Converted)",
  "Maisonette",
  "Barn conversion",
  "Commercial",
  "Other",
];

export const PARKING_OPTIONS = [
  "On street",
  "Driveway",
  "Private drive",
  "Permit required",
  "Pay & display",
  "No parking",
];

export const ACCESS_METHODS = [
  "Key safe",
  "Meet on site",
  "Tenant lets in",
  "Neighbour holds key",
  "We hold a key",
  "Concierge",
];

export const SAFETY_FLAGS = [
  "Asbestos",
  "Confined space",
  "Gas",
  "Working at height",
  "Stairs",
  "Lone working",
  "Electrical hazard",
];

/** Multi-select chips — used for safety flags and customer tags. */
export function MultiChips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <>
      <p className="t-field-label">{label}</p>
      <div className="t-chip-row t-chip-row--wrap">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={values.includes(o)}
            className={`t-chip${values.includes(o) ? " is-active" : ""}`}
            onClick={() => toggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </>
  );
}

/** ISO date <-> yyyy-mm-dd for <input type="date">. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T09:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
