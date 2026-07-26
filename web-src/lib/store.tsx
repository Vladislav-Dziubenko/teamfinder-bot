"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  type CaseItem,
  type BattlePassReward,
  type BattlePassTier,
  type LootCase,
  type PromoCode,
  type Rarity,
  type StarPack,
} from "@/lib/data"
import { api, telegramReady, openInvoice } from "@/lib/api"

export type InventoryItem = CaseItem & { uid: string; id?: number }

const DAY_MS = 24 * 60 * 60 * 1000
const BP_CLAIM_INTERVAL = 2 * DAY_MS
const FREE_SEARCHES = 5

type MeResponse = {
  user: { id: number; username?: string; first_name?: string; level?: number; wins?: number }
  currency: { coins: number; stars: number; points: number }
  mini_profile: {
    avatar: string | null
    nick: string | null
    bio: string | null
    deco: string
    unlocked_decos: string[]
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
  case_cooldowns: Record<string, string | null>
  premium_active: boolean
  promos?: Array<{
    code: string
    reward: { coins: number; stars: number; xp?: number }
    maxUses: number
    uses: number
    createdByUser: boolean
  }>
  redeemed_codes?: string[]
  cases: LootCase[]
  battlepass_tiers: BattlePassTier[]
  star_packs: StarPack[]
  daily_streak_rewards: { day: number; coins: number }[]
  referral_bot_url: string
  referral_reward: { coins: number; stars: number }
  battlepass_price_stars: number
  battlepass_xp_per_level: number
  default_promo_codes: PromoCode[]
}

type PersistedState = {
  stars: number
  coins: number
  points: number
  premiumActive: boolean
  inventory: InventoryItem[]
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
  lastQuestAt: number
  level: number
  wins: number
  lootCases: LootCase[]
  battlePassTiers: BattlePassTier[]
  battlePassPriceStars: number
  battlePassXpPerLevel: number
  referralBotUrl: string
  defaultPromoCodes: PromoCode[]
  dailyStreakRewards: { day: number; coins: number }[]
  starPacks: StarPack[]
  referralReward: { coins: number; stars: number }
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

function defaultState(): PersistedState {
  return {
    stars: 0,
    coins: 0,
    points: 0,
    premiumActive: false,
    inventory: [],
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
    lastQuestAt: 0,
    level: 0,
    wins: 0,
    lootCases: [],
    battlePassTiers: [],
    battlePassPriceStars: 0,
    battlePassXpPerLevel: 0,
    referralBotUrl: "",
    defaultPromoCodes: [],
    dailyStreakRewards: [],
    starPacks: [],
    referralReward: { coins: 0, stars: 0 },
  }
}

function mapMeToState(me: MeResponse): PersistedState {
  const user = me.user || {}
  const currency = me.currency || {}
  const mini = me.mini_profile || {}
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
      caseCooldown[caseId] = new Date(iso).getTime() + DAY_MS
    }
  }

  return {
    stars: currency.stars ?? 0,
    coins: currency.coins ?? 0,
    points: currency.points ?? 0,
    premiumActive: me.premium_active || false,
    inventory: (me.inventory || []).map((i) => enrichInventoryItem(i, registry)),
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
    bpLastClaimAt: bp.last_claim_at ? new Date(bp.last_claim_at).getTime() : 0,
    promoCodes,
    redeemedCodes,
    referralCode: ref.referral_code || makeReferralCode(),
    invitedCount: ref.invited_count || 0,
    referralEarned: ref.referral_earned_coins || 0,
    streakDay: streak.streak_day || 0,
    lastStreakAt: streak.last_streak_at ? new Date(streak.last_streak_at).getTime() : 0,
    claimedAchievements: achievements.filter((a) => a.claimed).map((a) => a.achievement_id),
    lastQuestAt: 0,
    level: user.level ?? 0,
    wins: user.wins ?? 0,
    lootCases,
    battlePassTiers: me.battlepass_tiers || [],
    battlePassPriceStars: me.battlepass_price_stars ?? 250,
    battlePassXpPerLevel: me.battlepass_xp_per_level ?? 100,
    referralBotUrl: me.referral_bot_url || "https://t.me/NexusTeammatesBot",
    defaultPromoCodes,
    dailyStreakRewards: me.daily_streak_rewards || [],
    starPacks: me.star_packs || [],
    referralReward: me.referral_reward || { coins: 50, stars: 5 },
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
  refresh: () => Promise<void>
  addCoins: (n: number) => Promise<boolean>
  addPoints: (n: number) => Promise<boolean>
  addXp: (n: number) => Promise<boolean>
  spendStars: (n: number) => Promise<boolean>
  spendCoins: (n: number) => Promise<boolean>
  buyCoinPack: (packId: string) => Promise<{ ok: boolean; error?: string }>
  buyStarPack: (packId: string) => Promise<{ ok: boolean; error?: string }>
  buyShopItem: (key: string) => Promise<{ ok: boolean; error?: string }>
  activatePremium: () => void
  addToInventory: (item: CaseItem) => void
  sellItem: (uid: string) => Promise<void>
  openCase: (caseId: string) => Promise<{ ok: boolean; item?: CaseItem; error?: string }>
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
}

const NexusContext = createContext<Nexus | null>(null)

export function NexusProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PersistedState>(defaultState)
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    telegramReady()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const me = (await api.get("/api/me")) as MeResponse
        if (!cancelled) {
          setS(mapMeToState(me))
        }
      } catch (e) {
        console.error("Failed to load Nexus state", e)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const me = (await api.get("/api/me")) as MeResponse
      setS(mapMeToState(me))
    } catch (e) {
      console.error("Failed to refresh Nexus state", e)
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
      try {
        const res = await api.post("/api/pay/invoice", { type: "star_pack", pack_id: packId })
        if (res?.invoice_link) {
          openInvoice(res.invoice_link)
        }
        return { ok: true }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось открыть оплату" }
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
      try {
        await api.post("/api/nexus/inventory/sell", { item_id: found.id })
        await refresh()
      } catch (e) {
        console.error("sellItem failed", e)
      }
    }

    const openCase = async (caseId: string): Promise<{ ok: boolean; item?: CaseItem; error?: string }> => {
      const c = s.lootCases.find((x) => x.id === caseId)
      if (!c) return { ok: false, error: "Кейс не найден" }
      if (!c.free && s.stars < c.costStars) return { ok: false, error: "Недостаточно Telegram Stars" }
      try {
        const data = await api.post("/api/nexus/cases/open", { case_id: caseId })
        await refresh()
        return { ok: true, item: data.item as CaseItem }
      } catch (e: any) {
        return { ok: false, error: e.message || "Не удалось открыть кейс" }
      }
    }

    const useFreeSearch = () => {
      let ok = false
      setS((p: PersistedState) => {
        if (p.freeSearchesLeft > 0) {
          ok = true
          return { ...p, freeSearchesLeft: p.freeSearchesLeft - 1 }
        }
        return p
      })
      return ok
    }

    const unlockPlayer = async (id: string, cost: number) => {
      if (s.unlockedPlayers.includes(id)) return true
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
        await refresh()
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

    return {
      ...s,
      bpLevel,
      freeCaseReadyIn: caseReadyIn("blue"),
      bpNextClaimIn,
      bpCanClaim,
      refresh,
      addCoins,
      addPoints,
      addXp,
      spendStars,
      spendCoins,
      buyCoinPack,
      buyShopItem,
      activatePremium,
      addToInventory,
      sellItem,
      openCase,
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
    }
  }, [s, now, refresh])

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-background text-foreground">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      </div>
    )
  }

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
      streakDay: nexus.streakDay,
      level: nexus.level,
      wins: nexus.wins,
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
      nexus.streakDay,
      nexus.level,
      nexus.wins,
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
