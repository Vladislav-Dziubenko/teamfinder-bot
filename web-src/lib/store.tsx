"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  type CaseItem,
  type BattlePassReward,
  type BattlePassTier,
  type LootCase,
  type PromoCode,
  type Rarity,
  type StarPack,
} from "@/lib/data"
import { api, telegramReady, openInvoice, syncTelegramProfile } from "@/lib/api"
import { parseIsoTs } from "@/lib/chat"

export type InventoryItem = CaseItem & { uid: string; id?: number }

export type LimitedModel = {
  token_id: number
  acquired_at: string
  sale_price_stars: number
  listed_at: string | null
  last_income_at: string | null
  seller_nick?: string
  avatar?: string | null
}

export type ModelState = {
  mine: LimitedModel[]
  market: LimitedModel[]
  claimed: number
  remaining: number
  supply: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const BP_CLAIM_INTERVAL = 2 * DAY_MS
const FREE_SEARCHES = 5
export const CONSENT_VERSION = 1

type MeResponse = {
  user: { id: number; username?: string; first_name?: string; level?: number; wins?: number }
  role?: string
  is_beta?: boolean
  currency: { coins: number; stars: number; points: number }
  mini_profile: {
    avatar: string | null
    nick: string | null
    bio: string | null
    deco: string
    unlocked_decos: string[]
    games: string[]
  }
  inventory: Array<{
    id: number
    item_key: string
    item_name: string
    item_rarity: string
    sell_price: number
    grants_premium: number
    acquired_at: string
  }>
  battlepass: {
    bp_premium: boolean
    bp_xp: number
    claimed_tiers: string[]
    claimed_count: number
    last_claim_at: string | null
  }
  streak: { streak_day: number; last_streak_at: string | null }
  referral: { referral_code: string; invited_count: number; referral_earned_coins: number }
  achievements: Array<{ achievement_id: string; claimed: number }>
  ad_state?: { watch_count: number; rewarded: number }
  case_cooldowns: Record<string, string | null>
  free_gold_opens?: number
  consent?: number
  welcome_bonus?: boolean
  premium_active: boolean
  promos?: Array<{
    code: string
    reward: { coins: number; stars: number; xp?: number }
    maxUses: number
    uses: number
    createdByUser: boolean
  }>
  redeemed_codes?: string[]
  beta_state?: { case_balance: number; last_grant: string } | null
  cases: LootCase[]
  battlepass_tiers: BattlePassTier[]
  star_packs: StarPack[]
  daily_streak_rewards: { day: number; coins: number }[]
  referral_bot_url: string
  direct_app_url: string
  referral_reward: { coins: number; stars: number }
  battlepass_price_stars: number
  battlepass_xp_per_level: number
  default_promo_codes: PromoCode[]
}

type PersistedState = {
  loaded: boolean
  stars: number
  coins: number
  points: number
  premiumActive: boolean
  inventory: InventoryItem[]
  pinnedKeys: string[]
  freeSearchesLeft: number
  unlockedPlayers: string[]
  caseCooldown: Record<string, number>
  avatar: string | null
  nick: string
  bio: string
  deco: string
  unlockedDecos: string[]
  bpPremium: boolean
  bpXp: number
  claimedTiers: string[]
  bpClaimedCount: number
  bpLastClaimAt: number
  promoCodes: PromoCode[]
  redeemedCodes: string[]
  referralCode: string
  invitedCount: number
  referralEarned: number
  streakDay: number
  lastStreakAt: number
  claimedAchievements: string[]
  adWatchCount: number
  adRewarded: number
  lastQuestAt: number
  level: number
  wins: number
  userId: number
  role: string
  isBeta: boolean
  lootCases: LootCase[]
  battlePassTiers: BattlePassTier[]
  battlePassPriceStars: number
  battlePassXpPerLevel: number
  referralBotUrl: string
  directAppUrl: string
  defaultPromoCodes: PromoCode[]
  dailyStreakRewards: { day: number; coins: number }[]
  starPacks: StarPack[]
  referralReward: { coins: number; stars: number }
  games: string[]
  modelState: ModelState
  betaBalance: number
  freeGoldOpens: number
  consentVersion: number
  welcomeBonus: boolean
}

function makeReferralCode() {
  return "NX" + Math.random().toString(36).slice(2, 8).toUpperCase()
}

function buildItemRegistry(lootCases: LootCase[]): Record<string, Partial<CaseItem>> {
  const reg: Record<string, Partial<CaseItem>> = {}
  for (const c of lootCases) {
    for (const i of c.items) {
      reg[i.key] = i
    }
  }
  return reg
}

function enrichInventoryItem(
  row: MeResponse["inventory"][number],
  registry: Record<string, Partial<CaseItem>>,
): InventoryItem {
  const reg = registry[row.item_key] || {}
  return {
    ...reg,
    key: row.item_key,
    name: row.item_name,
    desc: reg.desc || "Предмет",
    rarity: row.item_rarity as Rarity,
    sell: row.sell_price,
    grantsPremium: !!row.grants_premium,
    id: row.id,
    uid: `${row.id}-${row.item_key}`,
  } as InventoryItem
}

function mergePromos(
  defaults: PromoCode[],
  dbCodes: MeResponse["promos"],
  redeemed: string[],
): { codes: PromoCode[]; redeemedCodes: string[] } {
  const map = new Map<string, PromoCode>()
  for (const d of defaults) {
    map.set(d.code, { ...d })
  }
  for (const c of dbCodes || []) {
    map.set(c.code, {
      code: c.code,
      reward: c.reward,
      maxUses: c.maxUses,
      uses: c.uses,
      createdByUser: c.createdByUser,
    })
  }
  return { codes: Array.from(map.values()), redeemedCodes: redeemed || [] }
}

const CURRENCY_PERSIST_KEY = "nexus.currency.v1"
const PINS_PERSIST_KEY = "nexus.pins.v1"

function loadSavedPins(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(PINS_PERSIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function savePins(pins: string[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PINS_PERSIST_KEY, JSON.stringify(pins))
  } catch {
    // ignore quota / privacy errors
  }
}

function loadSavedCurrency(): { stars: number; coins: number; points: number } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CURRENCY_PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.stars === "number" && typeof parsed.coins === "number") {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function saveCurrency(state: PersistedState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      CURRENCY_PERSIST_KEY,
      JSON.stringify({ stars: state.stars, coins: state.coins, points: state.points }),
    )
  } catch {
    // ignore quota / privacy errors
  }
}

function defaultState(): PersistedState {
  const saved = loadSavedCurrency()
  return {
    loaded: false,
    stars: saved?.stars ?? 0,
    coins: saved?.coins ?? 0,
    points: saved?.points ?? 0,
    premiumActive: false,
    inventory: [],
    pinnedKeys: loadSavedPins(),
    freeSearchesLeft: FREE_SEARCHES,
    unlockedPlayers: [],
    caseCooldown: {},
    avatar: null,
    nick: "",
    bio: "",
    deco: "orange",
    unlockedDecos: ["orange"],
    bpPremium: false,
    bpXp: 0,
    claimedTiers: [],
    bpClaimedCount: 0,
    bpLastClaimAt: 0,
    promoCodes: [],
    redeemedCodes: [],
    referralCode: makeReferralCode(),
    invitedCount: 0,
    referralEarned: 0,
    streakDay: 0,
    lastStreakAt: 0,
    claimedAchievements: [],
    adWatchCount: 0,
    adRewarded: 0,
    lastQuestAt: 0,
    level: 0,
    wins: 0,
    lootCases: [],
    battlePassTiers: [],
    battlePassPriceStars: 0,
    battlePassXpPerLevel: 0,
    referralBotUrl: "",
    directAppUrl: "",
    defaultPromoCodes: [],
    dailyStreakRewards: [],
    starPacks: [],
    referralReward: { coins: 0, stars: 0 },
    games: [],
    userId: 0,
    role: "",
    isBeta: false,
    modelState: { mine: [], market: [], claimed: 0, remaining: 20, supply: 20 },
    betaBalance: 0,
    freeGoldOpens: 0,
    consentVersion: 0,
    welcomeBonus: false,
  }
}

function mapMeToState(me: MeResponse, modelState?: ModelState, pinnedKeys: string[] = []): PersistedState {
  const user = me.user || {}
  const currency = me.currency || {}
  const mini = me.mini_profile || {}
  const isBeta = me.is_beta ?? false
  const bp = me.battlepass || {}
  const streak = me.streak || {}
  const ref = me.referral || {}
  const achievements = me.achievements || []
  const lootCases = me.cases || []
  const registry = buildItemRegistry(lootCases)

  const defaultPromoCodes = me.default_promo_codes || []
  const { codes: promoCodes, redeemedCodes } = mergePromos(
    defaultPromoCodes,
    me.promos || [],
    me.redeemed_codes || [],
  )

  const caseCooldown: Record<string, number> = {}
  for (const [caseId, iso] of Object.entries(me.case_cooldowns || {})) {
    if (iso) {
      caseCooldown[caseId] = parseIsoTs(iso) + DAY_MS
    }
  }

  return {
    loaded: true,
    stars: currency.stars ?? 0,
    coins: currency.coins ?? 0,
    points: currency.points ?? 0,
    premiumActive: me.premium_active || false,
    inventory: (me.inventory || []).map((i) => enrichInventoryItem(i, registry)),
    pinnedKeys,
    freeSearchesLeft: FREE_SEARCHES,
    unlockedPlayers: [],
    caseCooldown,
    avatar: mini.avatar || null,
    nick: mini.nick || "",
    bio: mini.bio || "",
    deco: mini.deco || "orange",
    unlockedDecos: mini.unlocked_decos || ["orange"],
    bpPremium: bp.bp_premium || false,
    bpXp: bp.bp_xp || 0,
    claimedTiers: bp.claimed_tiers || [],
    bpClaimedCount: bp.claimed_count || 0,
    bpLastClaimAt: bp.last_claim_at ? parseIsoTs(bp.last_claim_at) : 0,
    promoCodes,
    redeemedCodes,
    referralCode: ref.referral_code || makeReferralCode(),
    invitedCount: ref.invited_count || 0,
    referralEarned: ref.referral_earned_coins || 0,
    streakDay: streak.streak_day || 0,
    lastStreakAt: streak.last_streak_at ? parseIsoTs(streak.last_streak_at) : 0,
    claimedAchievements: achievements.filter((a) => a.claimed).map((a) => a.achievement_id),
    adWatchCount: me.ad_state?.watch_count ?? 0,
    adRewarded: me.ad_state?.rewarded ?? 0,
    lastQuestAt: 0,
    userId: user.id ?? 0,
    role: me.role ?? "",
    isBeta: me.is_beta ?? false,
    level: user.level ?? 0,
    wins: user.wins ?? 0,
    lootCases,
    battlePassTiers: me.battlepass_tiers || [],
    battlePassPriceStars: me.battlepass_price_stars ?? 250,
    battlePassXpPerLevel: me.battlepass_xp_per_level ?? 100,
    referralBotUrl: me.referral_bot_url || "https://t.me/NexusTeammatesBot",
    directAppUrl: me.direct_app_url || "",
    defaultPromoCodes,
    dailyStreakRewards: me.daily_streak_rewards || [],
    starPacks: me.star_packs || [],
    referralReward: me.referral_reward || { coins: 50, stars: 5 },
    games: me.mini_profile?.games || [],
    modelState: modelState || { mine: [], market: [], claimed: 0, remaining: 20, supply: 20 },
    betaBalance: me.beta_state?.case_balance ?? 0,
    freeGoldOpens: me.free_gold_opens ?? 0,
    consentVersion: me.consent ?? 0,
    welcomeBonus: !!me.welcome_bonus,
  }
}

function grantReward(state: PersistedState, reward: BattlePassReward | null): PersistedState {
  if (!reward) return state
  const registry = buildItemRegistry(state.lootCases)
  const next: PersistedState = { ...state }
  if (reward.type === "coins") next.coins = state.coins + (reward.amount ?? 0)
  else if (reward.type === "stars") next.stars = state.stars + (reward.amount ?? 0)
  else if (reward.type === "premium") next.premiumActive = true
  else if (reward.type === "decoration") {
    const map: Record<string, string> = { Cyber: "cyan", Blood: "crimson", Gold: "gold", Neon: "orange" }
    const decoId = map[reward.name.replace(/Украшение «|»/g, "")] ?? "cyan"
    next.unlockedDecos = state.unlockedDecos.includes(decoId) ? state.unlockedDecos : [...state.unlockedDecos, decoId]
    next.premiumActive = true
  } else if (reward.type === "item") {
    const reg = registry[reward.key] || {}
    const item: InventoryItem = {
      ...reg,
      key: reward.key,
      name: reward.name,
      desc: "Награда батл-пасса",
      image: reward.image,
      icon: reward.icon,
      rarity: reward.rarity ?? "rare",
      sell: 40,
      weight: 0,
      grantsPremium: reward.rarity === "premium" || reward.rarity === "epic",
      uid: `${reward.key}-${Date.now()}-${Math.random()}`,
    } as InventoryItem
    next.inventory = [item, ...state.inventory]
    if (item.grantsPremium) next.premiumActive = true
  }
  return next
}

type Nexus = PersistedState & {
  bpLevel: number
  freeCaseReadyIn: number
  bpNextClaimIn: number
  bpCanClaim: boolean
  serverBusy: boolean
  setServerBusy: (v: boolean) => void
  refresh: () => Promise<void>
  addCoins: (n: number) => Promise<boolean>
  addPoints: (n: number) => Promise<boolean>
  addXp: (n: number) => Promise<boolean>
  spendStars: (n: number) => Promise<boolean>
  spendCoins: (n: number) => Promise<boolean>
  buyCoinPack: (packId: string) => Promise<{ ok: boolean; error?: string }>
  buyStarPack: (packId: string) => Promise<{ ok: boolean; error?: string }>
  buyStars: (amount: number) => Promise<{ ok: boolean; error?: string }>
  transferStars: (toUserId: number, amount: number) => Promise<{ ok: boolean; error?: string }>
  buyShopItem: (key: string) => Promise<{ ok: boolean; error?: string }>
  activatePremium: () => void
  addToInventory: (item: CaseItem) => void
  sellItem: (uid: string) => Promise<void>
  togglePin: (key: string) => void
  openCase: (caseId: string, count?: number, requestId?: string, viaAd?: boolean) => Promise<{ ok: boolean; item?: CaseItem; items?: CaseItem[]; error?: string }>
  refreshModels: () => Promise<void>
  recordAdWatch: () => Promise<{ ok: boolean; watch_count?: number; reward_stars?: number; error?: string }>
  listModel: (tokenId: number, price: number) => Promise<{ ok: boolean; error?: string }>
  unlistModel: (tokenId: number) => Promise<{ ok: boolean; error?: string }>
  buyModel: (tokenId: number) => Promise<{ ok: boolean; error?: string }>
  transferModel: (tokenId: number, toUserId: number) => Promise<{ ok: boolean; error?: string }>
  sellModel: (tokenId: number) => Promise<{ ok: boolean; error?: string; price?: number }>
  useFreeSearch: () => boolean
  unlockPlayer: (id: string, cost: number) => Promise<boolean>
  caseReadyIn: (caseId: string) => number
  setAvatar: (dataUrl: string | null) => void
  setNick: (v: string) => void
  setBio: (v: string) => void
  setDeco: (v: string) => Promise<void>
  saveProfile: () => Promise<void>
  buyBattlePass: () => Promise<boolean>
  claimTier: (key: string) => Promise<{ ok: boolean; error?: string }>
  claimNextBpTier: () => Promise<{ ok: boolean; tierLevel?: number; error?: string }>
  createPromo: (code: string, reward: PromoCode["reward"], maxUses: number) => Promise<{ ok: boolean; error?: string }>
  redeemPromo: (code: string) => Promise<{ ok: boolean; error?: string; reward?: PromoCode["reward"] }>
  simulateInvite: () => void
  claimDailyStreak: () => Promise<{ ok: boolean; coins?: number; day?: number; error?: string }>
  claimAchievement: (id: string, pts: number, cns: number) => Promise<void>
  hasUnlockedPlayer: (id: string) => boolean
  setGames: (games: string[]) => Promise<void>
  acceptConsent: () => Promise<void>
}

const NexusContext = createContext<Nexus | null>(null)

// Module-level setter for serverBusy — allows api.ts to set it without React context
let _setServerBusy: ((v: boolean) => void) | null = null
export function getServerBusySetter(): ((v: boolean) => void) | null { return _setServerBusy }

export function NexusProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PersistedState>(defaultState)
  const [now, setNow] = useState(() => Date.now())
  const [serverBusy, setServerBusy] = useState(false)
  const refreshing = useRef(false)

  useEffect(() => { _setServerBusy = setServerBusy; return () => { _setServerBusy = null } }, [setServerBusy])

  useEffect(() => {
    telegramReady()
    // Профиль Telegram (имя, username) — на бэкенд при каждом запуске.
    syncTelegramProfile()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load(attempt = 0) {
      try {
        const me = (await api.get("/api/me")) as MeResponse
        if (!cancelled) {
          const next = mapMeToState(me, undefined, loadSavedPins())
          setS(next)
          saveCurrency(next)
        }
      } catch (e: any) {
        // Ретраим на любые 5xx, 429 и сетевые таймауты — чтобы при временном
        // перегрузе сервера баланс не «залипал» на нуле (стартовое значение).
        const retriable = e?.status === 429 || (e?.status && e.status >= 500) || e?.timeout
        if (retriable && attempt < 10) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 500))
          if (!cancelled) return load(attempt + 1)
        }
        console.error("Failed to load Nexus state", e)
      }
    }
    load()
  }, [])

  useEffect(() => {
    // 30с вместо 1с — таймеры (кулдауны, баттлпасс) обновляются
    // достаточно плавно, но не триггерят полный пересчёт контекста каждую секунду.
    const id = setInterval(() => setNow(Date.now()), 30_000)

    function onVisibility() {
      if (document.hidden) {
        clearInterval(id)
      } else {
        setNow(Date.now())
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const refresh = useCallback(async () => {
    // Коалесценция: если refresh уже выполняется (например, серия fire-and-forget
    // вызовов после мульти-открытия кейсов), пропускаем новые — сервер и так
    // отдаст свежий баланс по завершении текущего запроса.
    if (refreshing.current) return
    refreshing.current = true
    try {
      const [me, modelState] = await Promise.all([
        api.get("/api/me"),
        api.get("/api/nexus/model/state"),
      ])
      // 429 = rate limit — сервер вернул "slow down", оставляем текущее состояние.
      if (me?.error === "slow down") return
      const next = mapMeToState(me as MeResponse, modelState as ModelState, loadSavedPins())
      setS(next)
      saveCurrency(next)
    } catch (e) {
      console.error("Failed to refresh Nexus state", e)
    } finally {
      refreshing.current = false
    }
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const state = (await api.get("/api/nexus/model/state")) as ModelState
      setS((p: PersistedState) => ({ ...p, modelState: state }))
    } catch (e) {
      console.error("Failed to refresh model state", e)
    }
  }, [])

  const value = useMemo<Nexus>(() => {
    const bpLevel = Math.max(s.bpClaimedCount, s.battlePassTiers.filter((t) => s.bpXp >= t.xp).length)
    const allBpClaimed = s.bpClaimedCount >= s.battlePassTiers.length
    const bpNextClaimIn = s.bpLastClaimAt ? Math.max(0, s.bpLastClaimAt + BP_CLAIM_INTERVAL - now) : 0
    const bpCanClaim = !allBpClaimed && bpNextClaimIn === 0

    const caseReadyIn = (caseId: string) => {
      const until = s.caseCooldown[caseId] ?? 0
      return Math.max(0, until - now)
    }

    const addCoins = async (n: number) => {
      console.warn("addCoins is deprecated; use buyCoinPack")
      return false
    }

    const addPoints = async (n: number) => false
    const addXp = async (n: number) => false

    const spendStars = async (n: number) => {
      try {
        await api.post("/api/nexus/spend-stars", { amount: n })
        await refresh()
        return true
      } catch {
        return false
      }
    }

    const spendCoins = async (n: number) => {
      console.warn("spendCoins is deprecated; use buyShopItem")
      return false
    }

    const buyCoinPack = async (packId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/exchange", { pack_id: packId })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось обменять" }
      }
    }

    const buyStarPack = async (packId: string): Promise<{ ok: boolean; error?: string }> => {
      const pack = s.starPacks.find((p) => p.id === packId)
      if (!pack) return { ok: false, error: "Пакет не найден" }
      if (s.stars >= pack.stars) {
        try {
          await api.post("/api/nexus/buy-star-pack", { pack_id: packId })
          await refresh()
          return { ok: true }
        } catch (e: any) {
          return { ok: false, error: e.message || "Не удалось купить пакет" }
        }
      }
      try {
        const res = await api.post("/api/pay/invoice", { type: "star_pack", pack_id: packId })
        if (res?.invoice_link) {
          openInvoice(res.invoice_link, () => refresh())
          return { ok: true }
        }
        return { ok: false, error: "Не удалось получить ссылку на оплату" }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось открыть оплату" }
      }
    }

    const buyStars = async (amount: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await api.post("/api/pay/invoice", { type: "buy_stars", amount })
        if (res?.invoice_link) {
          await new Promise<void>((resolve) => {
            openInvoice(res.invoice_link, () => refresh().then(resolve))
          })
          return { ok: true }
        }
        return { ok: false, error: "Не удалось получить ссылку на оплату" }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось открыть оплату" }
      }
    }

    const transferStars = async (toUserId: number, amount: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/transfer-stars", { to_user_id: toUserId, amount })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось отправить звёзды" }
      }
    }

    const buyShopItem = async (key: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/shop/buy", { item_key: key })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось купить" }
      }
    }

    const activatePremium = () => setS((p: PersistedState) => ({ ...p, premiumActive: true }))

    const addToInventory = (item: CaseItem) => {
      setS((p: PersistedState) => ({
        ...p,
        inventory: [{ ...item, uid: `${item.key}-${Date.now()}-${Math.random()}` }, ...p.inventory],
      }))
    }

    const sellItem = async (uid: string) => {
      const found = s.inventory.find((i: InventoryItem) => i.uid === uid)
      if (!found || found.id == null) return
      const sellAmount = found.sell ?? 0
      setS((p) => ({
        ...p,
        coins: p.coins + sellAmount,
        inventory: p.inventory.filter((i) => i.uid !== uid),
      }))
      try {
        await api.post("/api/nexus/inventory/sell", { item_id: found.id })
      } catch (e) {
        console.error("sellItem failed", e)
        await refresh()
      }
    }

    const togglePin = (key: string) => {
      setS((p: PersistedState) => {
        const pinned = p.pinnedKeys.includes(key)
          ? p.pinnedKeys.filter((k) => k !== key)
          : [...p.pinnedKeys, key]
        savePins(pinned)
        return { ...p, pinnedKeys: pinned }
      })
    }

    const openCase = async (caseId: string, count = 1, requestId?: string, viaAd = false): Promise<{ ok: boolean; item?: CaseItem; items?: CaseItem[]; error?: string }> => {
      const c = s.lootCases.find((x) => x.id === caseId)
      if (!c) return { ok: false, error: "Кейс не найден" }
      const isBeta = s.isBeta
      const betaPays = !c.free && isBeta && caseId === "gold" && s.betaBalance >= count
      const hasFreeGold = caseId === "gold" && s.freeGoldOpens >= count
      if (!c.free && !betaPays && !hasFreeGold) {
        if (c.costCoins && c.costCoins > 0) {
          if (s.coins < c.costCoins * count) return { ok: false, error: "Недостаточно монет Nexus" }
        } else if (s.stars < c.costStars * count) {
          return { ok: false, error: "Недостаточно Telegram Stars" }
        }
      }
      const rid =
        requestId ||
        (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rid-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      try {
        const data = await api.post("/api/nexus/cases/open", { case_id: caseId, count, request_id: rid, via_ad: viaAd, beta_free: betaPays })
        if (c.free && data.last_open_at) {
          const until = parseIsoTs(data.last_open_at) + DAY_MS
          setS((p: PersistedState) => ({
            ...p,
            caseCooldown: { ...p.caseCooldown, [caseId]: until },
          }))
        }
        refresh()
        if (Array.isArray(data.items) && data.items.length > 0) {
          return { ok: true, items: data.items as CaseItem[], item: data.items[0] as CaseItem }
        }
        return { ok: true, item: data.item as CaseItem }
      } catch (e: any) {
        await refresh()
        console.error("Error opening case:", e)
        return { ok: false, error: e.message || "Не удалось открыть кейс" }
      }
    }

    const listModel = async (tokenId: number, price: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/model/list", { token_id: tokenId, price })
        await refreshModels()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось выставить модель" }
      }
    }

    const unlistModel = async (tokenId: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/model/unlist", { token_id: tokenId })
        await refreshModels()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось снять с продажи" }
      }
    }

    const buyModel = async (tokenId: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/model/buy", { token_id: tokenId })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось купить модель" }
      }
    }

    const transferModel = async (tokenId: number, toUserId: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/nexus/model/transfer", { token_id: tokenId, to_user_id: toUserId })
        await refreshModels()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось передать модель" }
      }
    }

    const sellModel = async (tokenId: number): Promise<{ ok: boolean; error?: string; price?: number }> => {
      try {
        const data = await api.post("/api/nexus/model/sell", { token_id: tokenId })
        await refresh()
        await refreshModels()
        return { ok: true, price: data.price }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось продать модель" }
      }
    }

    const recordAdWatch = async (): Promise<{ ok: boolean; watch_count?: number; reward_stars?: number; error?: string }> => {
      try {
        const data = await api.post("/api/nexus/ad/watch")
        setS((p: PersistedState) => ({
          ...p,
          adWatchCount: data.watch_count ?? p.adWatchCount,
          adRewarded: data.rewarded ?? p.adRewarded,
        }))
        await refresh()
        return { ok: true, watch_count: data.watch_count, reward_stars: data.reward_stars }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось засчитать рекламу" }
      }
    }

    const useFreeSearch = () => {
      if (s.freeSearchesLeft <= 0) return false
      setS((p: PersistedState) => ({ ...p, freeSearchesLeft: p.freeSearchesLeft - 1 }))
      return true
    }

    const unlockPlayer = async (id: string, cost: number) => {
      if (s.unlockedPlayers.includes(id)) return true
      // Сначала пробуем бесплатное открытие анкеты (приветственный бонус
      // и т.п.) — сервер сам списывает free_contact_opens.
      try {
        const free = await api.post("/api/nexus/unlock-contact", { user_id: Number(id) })
        if (free.ok) {
          setS((p: PersistedState) => ({ ...p, unlockedPlayers: [...p.unlockedPlayers, id] }))
          return true
        }
      } catch {}
      if (s.stars < cost) return false
      const ok = await spendStars(cost)
      if (ok) {
        setS((p: PersistedState) => ({ ...p, unlockedPlayers: [...p.unlockedPlayers, id] }))
      }
      return ok
    }

    const setAvatar = (dataUrl: string | null) => {
      setS((p: PersistedState) => ({ ...p, avatar: dataUrl }))
      api.post("/api/profile/customize", { avatar: dataUrl }).then(refresh).catch(console.error)
    }
    const setNick = (v: string) => setS((p: PersistedState) => ({ ...p, nick: v }))
    const setBio = (v: string) => setS((p: PersistedState) => ({ ...p, bio: v }))
    const setDeco = async (v: string) => {
      setS((p: PersistedState) => ({ ...p, deco: v }))
      try {
        await api.post("/api/profile/customize", { deco: v })
        await refresh()
      } catch (e) {
        console.error("setDeco failed", e)
      }
    }
    const saveProfile = async () => {
      try {
        await api.post("/api/profile/customize", { nick: s.nick, bio: s.bio, avatar: s.avatar, deco: s.deco })
        await refresh()
      } catch (e) {
        console.error("saveProfile failed", e)
      }
    }

    const buyBattlePass = async () => {
      try {
        await api.post("/api/battlepass/buy")
        await refresh()
        return true
      } catch {
        return false
      }
    }

    const claimTier = async (key: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await api.post("/api/battlepass/claim-tier", { tier_key: key })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось забрать награду" }
      }
    }

    const claimNextBpTier = async (): Promise<{ ok: boolean; tierLevel?: number; error?: string }> => {
      try {
        const data = await api.post("/api/battlepass/claim-next")
        await refresh()
        return { ok: true, tierLevel: data.tierLevel }
      } catch (e: any) {
        return { ok: false, error: e.message || "Пока нельзя забрать" }
      }
    }

    const createPromo = async (
      code: string,
      reward: PromoCode["reward"],
      maxUses: number,
    ): Promise<{ ok: boolean; error?: string }> => {
      const clean = code.trim().toUpperCase()
      if (clean.length < 3) return { ok: false, error: "Код слишком короткий" }
      try {
        await api.post("/api/promo/create", { code: clean, reward, max_uses: maxUses })
        await refresh()
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось создать промокод" }
      }
    }

    const redeemPromo = async (
      code: string,
    ): Promise<{ ok: boolean; error?: string; reward?: PromoCode["reward"] }> => {
      const clean = code.trim().toUpperCase()
      try {
        const data = await api.post("/api/promo/redeem", { code: clean })
        await refresh()
        return { ok: true, reward: data.reward }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось активировать" }
      }
    }

    const simulateInvite = () => {
      const link = `${s.referralBotUrl}?start=${s.referralCode}`
      if (typeof window !== "undefined") {
        window.Telegram?.WebApp?.openTelegramLink?.(link)
      }
    }

    const claimDailyStreak = async (): Promise<{ ok: boolean; coins?: number; day?: number; error?: string }> => {
      try {
        const data = await api.post("/api/streak/claim")
        setS((p: PersistedState) => ({ ...p, streakDay: data.day ?? p.streakDay, lastStreakAt: Date.now() }))
        refresh()
        return { ok: true, coins: data.coins, day: data.day }
      } catch (e: any) {
        return { ok: false, error: e.message || "Уже забрано" }
      }
    }

    const claimAchievement = async (id: string, pts: number, cns: number) => {
      if (s.claimedAchievements.includes(id)) return
      try {
        await api.post("/api/achievements/claim", { achievement_id: id, points: pts, coins: cns })
        await refresh()
      } catch (e) {
        console.error("claimAchievement failed", e)
      }
    }

    const acceptConsent = async () => {
      try {
        await api.post("/api/user/consent", { version: CONSENT_VERSION })
      } catch (e) {
        console.error("acceptConsent failed", e)
      }
      setS((p: PersistedState) => ({ ...p, consentVersion: CONSENT_VERSION }))
    }

    const setGames = async (games: string[]) => {
      setS((p: PersistedState) => ({ ...p, games }))
      try {
        await api.post("/api/profile/customize", { games })
      } catch (e) {
        console.error("setGames failed", e)
      }
    }

    return {
      ...s,
      bpLevel,
      freeCaseReadyIn: caseReadyIn("blue"),
      caseCooldown: s.caseCooldown,
      bpNextClaimIn,
      bpCanClaim,
      refresh,
      addCoins,
      addPoints,
      addXp,
      spendStars,
      spendCoins,
      buyCoinPack,
      buyStarPack,
      buyStars,
      transferStars,
      buyShopItem,
      activatePremium,
      addToInventory,
      sellItem,
      togglePin,
      openCase,
      refreshModels,
      recordAdWatch,
      listModel,
      unlistModel,
      buyModel,
      transferModel,
      sellModel,
      useFreeSearch,
      unlockPlayer,
      caseReadyIn,
      setAvatar,
      setNick,
      setBio,
      setDeco,
      saveProfile,
      buyBattlePass,
      claimTier,
      claimNextBpTier,
      createPromo,
      redeemPromo,
      simulateInvite,
      claimDailyStreak,
      claimAchievement,
      hasUnlockedPlayer: (id: string) => s.unlockedPlayers.includes(id),
      setGames,
      acceptConsent,
      serverBusy,
      setServerBusy,
    }
  }, [s, now, refresh, refreshModels, serverBusy, setServerBusy])

  return <NexusContext.Provider value={value}>{children}</NexusContext.Provider>
}

export function useNexus() {
  const ctx = useContext(NexusContext)
  if (!ctx) throw new Error("useNexus must be used within NexusProvider")
  return ctx
}

export function useMe() {
  const nexus = useNexus()
  return useMemo(
    () => ({
      nick: nexus.nick,
      avatar: nexus.avatar,
      bio: nexus.bio,
      deco: nexus.deco,
      unlockedDecos: nexus.unlockedDecos,
      stars: nexus.stars,
      coins: nexus.coins,
      points: nexus.points,
      premiumActive: nexus.premiumActive,
      referralCode: nexus.referralCode,
      referralBotUrl: nexus.referralBotUrl,
      directAppUrl: nexus.directAppUrl,
      streakDay: nexus.streakDay,
      level: nexus.level,
      wins: nexus.wins,
      userId: nexus.userId,
      role: nexus.role,
      isBeta: nexus.isBeta,
      games: nexus.games,
      refresh: nexus.refresh,
    }),
    [
      nexus.nick,
      nexus.avatar,
      nexus.bio,
      nexus.deco,
      nexus.unlockedDecos,
      nexus.stars,
      nexus.coins,
      nexus.points,
      nexus.premiumActive,
      nexus.referralCode,
      nexus.referralBotUrl,
      nexus.directAppUrl,
      nexus.streakDay,
      nexus.level,
      nexus.wins,
      nexus.userId,
      nexus.role,
      nexus.isBeta,
      nexus.games,
      nexus.refresh,
    ],
  )
}

export function useAchievements() {
  const nexus = useNexus()
  return useMemo(
    () => ({
      claimedAchievements: nexus.claimedAchievements,
      lastQuestAt: nexus.lastQuestAt,
      claimAchievement: nexus.claimAchievement,
    }),
    [nexus.claimedAchievements, nexus.lastQuestAt, nexus.claimAchievement],
  )
}

export function useInventory() {
  const nexus = useNexus()
  return useMemo(
    () => ({
      inventory: nexus.inventory,
      sellItem: nexus.sellItem,
    }),
    [nexus.inventory, nexus.sellItem],
  )
}

export function usePremium() {
  const nexus = useNexus()
  return useMemo(() => ({ premiumActive: nexus.premiumActive }), [nexus.premiumActive])
}
