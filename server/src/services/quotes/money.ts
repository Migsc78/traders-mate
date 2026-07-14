import type { PriceUnit } from "@prisma/client";

export interface LineInput {
  label: string;
  qty: number;
  unit: PriceUnit;
  unitPricePence: number;
  vatRate: number;
  priceBookItemId?: string | null;
  source?: string;
}

export function totalsFromLines(lines: LineInput[], vatInclusive: boolean) {
  let subtotalPence = 0;
  let vatPence = 0;
  for (const line of lines) {
    const lineGross = Math.round(line.qty * line.unitPricePence);
    const rate = line.vatRate / 100;
    if (vatInclusive) {
      const net = Math.round(lineGross / (1 + rate));
      const vat = lineGross - net;
      subtotalPence += net;
      vatPence += vat;
    } else {
      const vat = Math.round(lineGross * rate);
      subtotalPence += lineGross;
      vatPence += vat;
    }
  }
  const totalPence = vatInclusive
    ? lines.reduce((s, l) => s + Math.round(l.qty * l.unitPricePence), 0)
    : subtotalPence + vatPence;
  return { subtotalPence, vatPence, totalPence };
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
