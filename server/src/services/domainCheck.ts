import { env } from "../env.js";
import { domainCandidates } from "../utils/slug.js";

export type DomainState = "AVAILABLE" | "TAKEN" | "UNKNOWN";
export interface DomainResult {
  suggested: string | null;
  state: DomainState;
  affiliateLink: string | null;
}

interface DomainChecker {
  check(domain: string): Promise<DomainState>;
}

// RDAP for .uk (Nominet). Free, registrar-neutral, no account needed. Default.
const rdapChecker: DomainChecker = {
  async check(domain: string): Promise<DomainState> {
    try {
      const res = await fetch(`https://rdap.nominet.uk/uk/domain/${domain}`, {
        headers: { Accept: "application/rdap+json" },
      });
      if (res.status === 404) return "AVAILABLE";
      if (res.ok) return "TAKEN";
      return "UNKNOWN";
    } catch {
      return "UNKNOWN";
    }
  },
};

// IONOS reseller/developer API (env-only, if DOMAIN_CHECK_PROVIDER=ionos).
const ionosChecker: DomainChecker = {
  check: async (domain) => {
    const { checkAvailability } = await import("./ionos.js");
    return checkAvailability(domain);
  },
};

const offChecker: DomainChecker = {
  async check(): Promise<DomainState> {
    return "UNKNOWN";
  },
};

function pickChecker(): DomainChecker {
  switch (env.DOMAIN_CHECK_PROVIDER) {
    case "ionos":
      return ionosChecker;
    case "off":
      return offChecker;
    default:
      return rdapChecker;
  }
}

/**
 * Best-effort: never throws. Picks the first available candidate (else the primary).
 */
export async function checkDomain(displayName: string, town: string): Promise<DomainResult> {
  const candidates = domainCandidates(displayName, town);
  if (candidates.length === 0) return { suggested: null, state: "UNKNOWN", affiliateLink: null };
  const checker = pickChecker();

  for (const candidate of candidates) {
    const state = await checker.check(candidate).catch(() => "UNKNOWN" as DomainState);
    if (state === "AVAILABLE") {
      return { suggested: candidate, state, affiliateLink: null };
    }
  }
  const primary = candidates[0];
  const primaryState = await checker.check(primary).catch(() => "UNKNOWN" as DomainState);
  return { suggested: primary, state: primaryState, affiliateLink: null };
}
