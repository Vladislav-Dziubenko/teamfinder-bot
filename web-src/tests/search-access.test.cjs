const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const ts = require("typescript")
const { test } = require("node:test")

// Run the real TypeScript helpers without adding a test framework dependency.
const source = readFileSync(require("node:path").join(__dirname, "../lib/search-access.ts"), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const mod = { exports: {} }
new Function("module", "exports", compiled.outputText)(mod, mod.exports)
const { searchLimit, remainingSearches, hasUnlimitedSearch } = mod.exports
const now = Date.parse("2026-09-16T12:00:00Z")

test("case premium removes the five-search gate until its actual expiry", () => {
  assert.equal(hasUnlimitedSearch(true, "2026-09-17T12:00:00", now), true)
  assert.equal(hasUnlimitedSearch(true, "2026-09-16T11:59:00", now), false)
  assert.equal(hasUnlimitedSearch(false, "2026-09-17T12:00:00", now), false)
})
test("case bonus adds searches even when all five have been used", () => {
  assert.equal(searchLimit(10), 15)
  assert.equal(remainingSearches(0, 0, 10), 10)
})
test("profile refresh neither resets used searches nor reapplies bonuses", () => {
  assert.equal(remainingSearches(3, 0, 0), 3)
  assert.equal(remainingSearches(10, 10, 10), 10)
  assert.equal(remainingSearches(10, 10, 15), 15)
})
test("bad or expired balances never produce negative allowances", () => {
  assert.equal(searchLimit(-5), 5)
  assert.equal(remainingSearches(1, 10, 0), 0)
})
