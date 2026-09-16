export const FREE_SEARCHES = 5

export function searchLimit(bonus: number | undefined): number {
  return FREE_SEARCHES + Math.max(0, Math.floor(Number(bonus) || 0))
}

// Refreshing a profile or receiving a new case reward must not reset searches
// already used. New bonus searches are added to the remaining balance.
export function remainingSearches(previousLeft: number, previousBonus: number, nextBonus: number): number {
  const used = Math.max(0, searchLimit(previousBonus) - previousLeft)
  return Math.max(0, searchLimit(nextBonus) - used)
}

export function hasUnlimitedSearch(premium: boolean, until: string | null | undefined, now: number): boolean {
  if (!premium) return false
  if (!until) return true
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(until) ? until : until + "Z"
  return Date.parse(utc) > now
}
