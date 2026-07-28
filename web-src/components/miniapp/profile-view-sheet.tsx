"use client"

import { useState, useEffect } from "react"
import { X, UserPlus, UserCheck, MessageCircle, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { api } from "@/lib/api"

interface SharedProfile {
  id: number
  nick: string
  avatar: string | null
  bio: string | null
}

export function ProfileViewSheet({
  userId,
  onClose,
  onChat,
}: {
  userId: number
  onClose: () => void
  onChat: (id: number) => void
}) {
  const { t } = useI18n()
  const [profile, setProfile] = useState<SharedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [friendLoading, setFriendLoading] = useState(false)
  const [friendSent, setFriendSent] = useState(false)

  useEffect(() => {
    api.get("/api/profile/by-id/" + userId).then((d: any) => {
      if (d.error) setProfile(null)
      else setProfile(d)
    }).catch(() => setProfile(null)).finally(() => setLoading(false))
  }, [userId])

  async function addFriend() {
    setFriendLoading(true)
    try {
      const res = await api.post("/api/friends/add/" + userId)
      if (res.error === "cannot add yourself") return
      setFriendSent(true)
    } catch {}
    setFriendLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card p-5 pb-8 animate-rise">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/40" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("profile_view.not_found")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <img
                src={profile.avatar || "/placeholder.svg"}
                alt={profile.nick}
                className="size-14 rounded-2xl object-cover ring-1 ring-border"
              />
              <div>
                <p className="font-display text-xl font-bold leading-tight">{profile.nick}</p>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm leading-relaxed text-muted-foreground">
                {profile.bio}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => onChat(userId)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
              >
                <MessageCircle className="size-4" /> {t("profile_view.send_message")}
              </button>
              <button
                type="button"
                onClick={addFriend}
                disabled={friendSent || friendLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary/60 py-3 text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
              >
                {friendLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : friendSent ? (
                  <><UserCheck className="size-4" /> {t("common.done")}</>
                ) : (
                  <><UserPlus className="size-4" /> {t("profile_view.add_friend")}</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
