import { ApiError } from "../../middleware/error.js";

export type BankFields = {
  bankName?: string | null;
  bankSortCode?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
};

/** Normalize UK sort code to XX-XX-XX or empty. */
export function normalizeSortCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 6) {
    throw new ApiError(400, "bad_sort_code", "Sort code must be 6 digits (e.g. 00-00-00)");
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

/** Normalize UK account number to 8 digits or empty. */
export function normalizeAccountNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 8) {
    throw new ApiError(400, "bad_account_number", "Account number must be 8 digits");
  }
  return digits;
}

export function normalizeBankFields(input: BankFields): {
  bankName: string | null;
  bankSortCode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
} {
  const bankName = input.bankName?.trim() || null;
  const bankAccountName = input.bankAccountName?.trim() || null;
  const bankSortCode = normalizeSortCode(input.bankSortCode);
  const bankAccountNumber = normalizeAccountNumber(input.bankAccountNumber);

  const any =
    !!bankName || !!bankSortCode || !!bankAccountName || !!bankAccountNumber;
  if (any && (!bankSortCode || !bankAccountNumber || !bankAccountName)) {
    throw new ApiError(
      400,
      "incomplete_bank",
      "Enter account name, sort code, and account number (or leave all blank)"
    );
  }

  return { bankName, bankSortCode, bankAccountName, bankAccountNumber };
}

export function hasBankDetails(bank: {
  bankSortCode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
}): boolean {
  return !!(bank.bankSortCode && bank.bankAccountName && bank.bankAccountNumber);
}
