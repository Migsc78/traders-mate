function cell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => cell(String(c))).join(",");
  const body = rows.map((row) => columns.map((c) => cell(row[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
