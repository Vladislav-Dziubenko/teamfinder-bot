"use client"

import { api } from "./api"

export type ClanRole = "leader" | "officer" | "member"

export type ClanMember = {
  user_id: number
  role: string
  contribution_season: number
  contribution_total: number
  joined_at: string
  nick: string
  avatar: string | null
}

export type Clan = {
  id: number
  name: string
  tag: string
  emblem: string
  description: string
  is_public: number
  max_members: number
  level: number
  lifetime_points: number
  bank_points: number
  member_count: number
  my_role?: string
  members?: ClanMember[]
}

export type ClanQuest = {
  id: number
  kind: string
  target_type: string
  target_value: number
  progress: number
  starts_at: string
  ends_at: string
  claimed: number
}

export type ShopItem = {
  id: number
  title: string
  cost_points: number
  payload: string
  stock: number
}

export const clansApi = {
  my(): Promise<{ clan: Clan | null }> {
    return api.get("/api/clans/my")
  },
  detail(id: number): Promise<{ clan: Clan }> {
    return api.get(`/api/clans/${id}`)
  },
  search(q: string): Promise<{ clans: Clan[] }> {
    return api.get(`/api/clans/search?q=${encodeURIComponent(q)}`)
  },
  create(body: { name: string; tag: string; emblem: string; description: string; is_public: boolean }): Promise<{ clan: Clan }> {
    return api.post("/api/clans", body)
  },
  join(id: number, invite_code?: string): Promise<{ ok: boolean }> {
    return api.post(`/api/clans/${id}/join`, invite_code ? { invite_code } : {})
  },
  leave(id: number): Promise<{ ok: boolean; disbanded?: boolean; new_leader?: number }> {
    return api.post(`/api/clans/${id}/leave`, {})
  },
  kick(id: number, user_id: number): Promise<{ ok: boolean }> {
    return api.post(`/api/clans/${id}/kick`, { user_id })
  },
  setRole(id: number, user_id: number, role: string): Promise<{ ok: boolean }> {
    return api.post(`/api/clans/${id}/role`, { user_id, role })
  },
  invite(id: number): Promise<{ ok: boolean; code: string }> {
    return api.post(`/api/clans/${id}/invites`, {})
  },
  settings(id: number, body: Record<string, unknown>): Promise<{ ok: boolean }> {
    return api.post(`/api/clans/${id}/settings`, body)
  },
  quests(id: number): Promise<{ quests: ClanQuest[] }> {
    return api.get(`/api/clans/${id}/quests`)
  },
  claimQuest(id: number, questId: number): Promise<{ ok: boolean; bank_bonus: number }> {
    return api.post(`/api/clans/${id}/quests/${questId}/claim`, {})
  },
  leaderboard(by: "total" | "per_member"): Promise<{ by: string; board: any[] }> {
    return api.get(`/api/clans/leaderboard?by=${by}`)
  },
  seasonCurrent(): Promise<{ season: any; top_total: any[]; top_eff: any[] }> {
    return api.get("/api/clans/seasons/current")
  },
  seasonMembers(seasonId: string, clanId: number): Promise<{ members: any[] }> {
    return api.get(`/api/clans/seasons/${seasonId}/members?clan_id=${clanId}`)
  },
  seasonHistory(): Promise<{ history: any[] }> {
    return api.get("/api/clans/seasons/history")
  },
  shop(id: number): Promise<{ items: ShopItem[]; bank_points: number; my_role: string }> {
    return api.get(`/api/clans/${id}/shop`)
  },
  shopBuy(id: number, item_id: number): Promise<{ ok: boolean; title: string; cost: number }> {
    return api.post(`/api/clans/${id}/shop/buy`, { item_id })
  },
}
