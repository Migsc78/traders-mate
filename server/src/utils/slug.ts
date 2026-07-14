// Build candidate .co.uk domain names from a business name + town.

function clean(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|llp|plc|the|co|company|services|uk)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function domainCandidates(displayName: string, town: string): string[] {
  const name = clean(displayName);
  const place = clean(town);
  const nameJoined = name.replace(/\s+/g, "");
  const nameHyphen = name.replace(/\s+/g, "-");
  const placeJoined = place.replace(/\s+/g, "");

  const bases = new Set<string>();
  if (nameJoined) bases.add(nameJoined);
  if (nameJoined && placeJoined && !nameJoined.includes(placeJoined)) {
    bases.add(`${nameJoined}${placeJoined}`);
    bases.add(`${nameHyphen}-${placeJoined}`);
  }

  return Array.from(bases)
    .filter((b) => b.length >= 3 && b.length <= 63)
    .slice(0, 3)
    .map((b) => `${b}.co.uk`);
}
