"use client"

import { useState } from "react"
import { Gamepad2, Mic, MicOff } from "lucide-react"
import { api, type GamesResponse, type MeResponse, type Profile } from "@/lib/api"
import { cn } from "@/lib/utils"

export function ProfileTab({
  games,
  me,
  onSaved,
}: {
  games: GamesResponse
  me: MeResponse | null
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(!me?.profile)
  const profile = me?.profile ?? null

  if (editing) {
    return <ProfileForm games={games} existing={profile} onDone={() => { setEditing(false); onSaved() }} />
  }

  const gameInfo = profile ? games.games[profile.game] : null

  return (
    <div className="space-y-5 px-4 py-5">
      <section className="animate-rise rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-20 place-items-center rounded-3xl bg-primary font-display text-3xl font-bold text-primary-foreground">
            {profile!.nickname.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold leading-tight">{profile!.nickname}</h1>
            <p className="text-sm text-muted-foreground">{profile!.rank}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
              <Gamepad2 className="size-3 text-primary" /> {gameInfo?.title}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Row label="Роль" value={profile!.role} />
          <Row label="Онлайн" value={games.playtime[profile!.playtime] ?? profile!.playtime} />
          <Row label="Ищет" value={games.looking_for[profile!.looking_for] ?? profile!.looking_for} />
          <Row
            label="Микрофон"
            value={profile!.has_mic ? "Есть" : "Нет"}
            icon={profile!.has_mic ? Mic : MicOff}
          />
        </div>

        {profile!.description && (
          <p className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground">
            {profile!.description}
          </p>
        )}
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Изменить анкету
        </button>
        <button
          type="button"
          onClick={async () => {
            await api.hideProfile()
            onSaved()
            setEditing(true)
          }}
          className="flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground"
        >
          Скрыть анкету
        </button>
      </div>

      <p className="pb-2 text-center text-xs text-muted-foreground">NEXUS · Telegram Mini App</p>
    </div>
  )
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Mic
}) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 font-semibold">
        {Icon && <Icon className="size-3.5 text-primary" />} {value}
      </p>
    </div>
  )
}

function ProfileForm({
  games,
  existing,
  onDone,
}: {
  games: GamesResponse
  existing: Profile | null
  onDone: () => void
}) {
  const gameIds = Object.keys(games.games)
  const [game, setGame] = useState(existing?.game ?? gameIds[0])
  const [nickname, setNickname] = useState(existing?.nickname ?? "")
  const [rank, setRank] = useState(existing?.rank ?? games.games[gameIds[0]].ranks[0])
  const [role, setRole] = useState(existing?.role ?? games.games[gameIds[0]].roles[0])
  const [playtime, setPlaytime] = useState(existing?.playtime ?? Object.keys(games.playtime)[0])
  const [lookingFor, setLookingFor] = useState(existing?.looking_for ?? Object.keys(games.looking_for)[0])
  const [region, setRegion] = useState(existing?.region ?? "")
  const [contact, setContact] = useState(existing?.contact ?? "")
  const [hasMic, setHasMic] = useState(existing?.has_mic !== 0)
  const [description, setDescription] = useState(existing?.description ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gameInfo = games.games[game]

  function changeGame(id: string) {
    setGame(id)
    setRank(games.games[id].ranks[0])
    setRole(games.games[id].roles[0])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nickname.trim() || !contact.trim()) {
      setError("Заполни ник и контакт")
      return
    }
    setSaving(true)
    try {
      await api.saveProfile({
        game,
        nickname: nickname.trim(),
        rank,
        role,
        playtime,
        looking_for: lookingFor,
        region: region.trim(),
        contact: contact.trim(),
        has_mic: hasMic as unknown as number,
        description: description.trim(),
      })
      onDone()
    } catch (err: any) {
      setError(err.message || "Не получилось сохранить")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-2xl font-bold">{existing ? "Изменить анкету" : "Заполни анкету"}</h1>
        <p className="text-sm text-muted-foreground">Это увидят другие игроки в поиске</p>
      </div>

      <Field label="Игра">
        <ChipRow options={gameIds.map((id) => ({ id, label: `${games.games[id].emoji} ${games.games[id].title}` }))} value={game} onChange={changeGame} />
      </Field>

      <Field label="Ник в игре">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={32}
          required
          className="w-full rounded-2xl border border-input bg-secondary/60 px-4 py-3 text-sm outline-none focus:border-primary/60"
        />
      </Field>

      <Field label="Ранг">
        <ChipRow options={gameInfo.ranks.map((r) => ({ id: r, label: r }))} value={rank} onChange={setRank} />
      </Field>

      <Field label="Роль">
        <ChipRow options={gameInfo.roles.map((r) => ({ id: r, label: r }))} value={role} onChange={setRole} />
      </Field>

      <Field label="Сколько играешь">
        <ChipRow
          options={Object.entries(games.playtime).map(([id, label]) => ({ id, label }))}
          value={playtime}
          onChange={setPlaytime}
        />
      </Field>

      <Field label="Что ищешь">
        <ChipRow
          options={Object.entries(games.looking_for).map(([id, label]) => ({ id, label }))}
          value={lookingFor}
          onChange={setLookingFor}
        />
      </Field>

      <Field label="Регион (необязательно)">
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          maxLength={40}
          className="w-full rounded-2xl border border-input bg-secondary/60 px-4 py-3 text-sm outline-none focus:border-primary/60"
        />
      </Field>

      <Field label="Контакт (@username, Discord, ссылка)">
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={80}
          required
          className="w-full rounded-2xl border border-input bg-secondary/60 px-4 py-3 text-sm outline-none focus:border-primary/60"
        />
      </Field>

      <Field label="Микрофон">
        <ChipRow
          options={[{ id: "1", label: "🎤 Есть" }, { id: "0", label: "🔇 Нет" }]}
          value={hasMic ? "1" : "0"}
          onChange={(v) => setHasMic(v === "1")}
        />
      </Field>

      <Field label="О себе (необязательно)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full rounded-2xl border border-input bg-secondary/60 px-4 py-3 text-sm outline-none focus:border-primary/60"
        />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Сохраняем…" : "Сохранить анкету"}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
            value === o.id
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
