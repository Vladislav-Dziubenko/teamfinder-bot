"use client"

import { useDiscord } from "@/lib/hooks/useDiscord"

export function DiscordSection() {
  const { status, loading, busy, error, connect, unlink } = useDiscord()

  return (
    <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center text-white font-bold">
            D
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Discord</div>
            <div className="text-xs text-neutral-400">
              Привяжи аккаунт, чтобы находить тиммейтов по голосу
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-neutral-500">Загрузка статуса…</div>
      ) : status?.linked ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {status.avatar_url ? (
              <img
                src={status.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neutral-700" />
            )}
            <div className="min-w-0">
              <div className="text-sm text-white truncate">
                {status.global_name || status.username || "Discord user"}
              </div>
              {status.username && (
                <div className="text-xs text-neutral-400 truncate">
                  @{status.username}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={unlink}
            disabled={busy}
            className="text-xs px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-50"
          >
            {busy ? "…" : "Отвязать"}
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Открываем Discord…" : "Подключить Discord"}
        </button>
      )}

      {error && (
        <div className="text-xs text-red-400 break-words">{error}</div>
      )}
    </section>
  )
}