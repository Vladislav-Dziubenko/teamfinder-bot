"use client"

import { useEffect, useState } from "react"
import { UserPlus, UserCheck, UserX, MessageCircle, Clock, ChevronRight, Users } from "lucide-react"
import { api } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { Player } from "@/lib/data"

type Friend = {
  friend_id: number
  nick: string | null
  avatar: string | null
  online: boolean
}

type FriendRequest = {
  requester_id: number
  nick: string | null
  avatar: string | null
}

export function FriendsTab({
  onChat,
}: {
  onChat?: (player: Player) => void
}) {
  const { t } = useI18n()
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [tab, setTab] = useState<"friends" | "requests">("friends")

  function load() {
    api.get("/api/friends/list").then((d: any) => setFriends(d.friends ?? []))
    api.get("/api/friends/requests").then((d: any) => setRequests(d.requests ?? []))
  }

  useEffect(load, [])

  async function accept(id: number) {
    await api.post("/api/friends/accept/" + id)
    load()
  }

  async function decline(id: number) {
    await api.post("/api/friends/decline/" + id)
    load()
  }

  async function remove(id: number) {
    await api.post("/api/friends/remove/" + id)
    load()
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("friends.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("friends.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setTab(tab === "friends" ? "requests" : "friends")}
          className="relative rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold active:scale-95"
        >
          {tab === "friends" ? t("friends.requests_tab") : t("friends.friends_tab")}
          {requests.length > 0 && tab === "friends" && (
            <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {tab === "friends" ? (
        friends.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-12 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-display text-lg font-bold">{t("friends.empty_title")}</p>
            <p className="text-sm text-muted-foreground">{t("friends.empty_hint")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => (
              <div
                key={f.friend_id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="relative shrink-0">
                  <img
                    src={f.avatar || "/placeholder.svg"}
                    alt={f.nick ?? String(f.friend_id)}
                    className="size-11 rounded-2xl object-cover"
                  />
                  {f.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-accent" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{f.nick ?? f.friend_id}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {f.online ? (
                      <><span className="size-1.5 rounded-full bg-accent" /> {t("common.online")}</>
                    ) : (
                      <><Clock className="size-3" /> {t("common.offline")}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChat?.({ id: f.friend_id, nick: f.nick ?? "", avatar: f.avatar ?? "" } as Player)}
                    className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary active:scale-90"
                  >
                    <MessageCircle className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(f.friend_id)}
                    className="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive active:scale-90"
                  >
                    <UserX className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        requests.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-12 text-center">
            <UserCheck className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-display text-lg font-bold">{t("friends.no_requests")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.requester_id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <img
                  src={r.avatar || "/placeholder.svg"}
                  alt={r.nick ?? String(r.requester_id)}
                  className="size-11 rounded-2xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{r.nick ?? r.requester_id}</p>
                  <p className="text-[11px] text-muted-foreground">{t("friends.request_from")}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => accept(r.requester_id)}
                    className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent active:scale-90"
                  >
                    <UserCheck className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => decline(r.requester_id)}
                    className="grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive active:scale-90"
                  >
                    <UserX className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
