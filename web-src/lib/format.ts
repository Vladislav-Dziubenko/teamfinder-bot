const full = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

const compact = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return full.format(n)
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return compact.format(n)
}
