"use client"

import { useEffect, useRef, useState } from "react"
import { Gem, Send, Star, Loader2, Wallet, Crown, RefreshCw, History, EyeOff } from "lucide-react"
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react"
import { useNexus } from "@/lib/store"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function fmtDateTime(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

function ModelViewer({ src = "/nexus-model.glb" }: { src?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let scene: any
    let renderer: any
    let camera: any
    let controls: any
    let model: any
    let frame = 0

    async function init() {
      const container = containerRef.current
      if (!container) return
      const THREE = await import("three")
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")

      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000)
      camera.position.set(0, 1.4, 4.2)

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(container.clientWidth, container.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)

      scene.add(new THREE.AmbientLight(0xffffff, 1.1))
      const dir = new THREE.DirectionalLight(0xffffff, 2.4)
      dir.position.set(3, 5, 4)
      scene.add(dir)
      const rim = new THREE.DirectionalLight(0xffd700, 1.6)
      rim.position.set(-4, 2, -3)
      scene.add(rim)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.autoRotate = true
      controls.autoRotateSpeed = 2.5
      controls.enableZoom = false

      const loader = new GLTFLoader()
      loader.load(
        src,
        (gltf: any) => {
          if (disposed) return
          model = gltf.scene
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          model.position.sub(center)
          if (maxDim > 2.6) model.scale.multiplyScalar(2.6 / maxDim)
          scene.add(model)
          setReady(true)
        },
        undefined,
        (err: unknown) => console.error("GLB load error", err),
      )

      const animate = () => {
        if (disposed) return
        frame = requestAnimationFrame(animate)
        if (model) model.rotation.y += 0.003
        controls.update()
        renderer.render(scene, camera)
      }
      animate()
    }

    init()

    const onResize = () => {
      if (!containerRef.current || !renderer) return
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", onResize)

    return () => {
      disposed = true
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(frame)
      controls?.dispose()
      renderer?.dispose()
      containerRef.current?.querySelectorAll("canvas").forEach((c) => c.remove())
    }
  }, [])

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-3xl border border-[#ffd700]/30 bg-gradient-to-b from-[#ffd700]/10 to-transparent">
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-[#ffd700]" />
        </div>
      )}
    </div>
  )
}

export function ModelTab({ onToast }: { onToast: (m: string) => void }) {
  const { t, lang } = useI18n()
  const { modelState, modelHistory, stars, listModel, unlistModel, buyModel, transferModel, sellModel, refreshModels, refreshModelHistory } = useNexus()
  const [listing, setListing] = useState<number | null>(null)
  const [price, setPrice] = useState("")
  const [transfer, setTransfer] = useState<number | null>(null)
  const [transferId, setTransferId] = useState("")
  const [busy, setBusy] = useState(false)
  const [tonBusy, setTonBusy] = useState(false)

  const meta = modelState.meta ?? { name: "Mini Boss bro", icon: "💎", desc: "", glb: "/nexus-model.glb" }
  const soldOut = modelState.remaining === 0

  async function submitList(token: number) {
    const p = parseInt(price, 10)
    if (!p || p <= 0) {
      onToast(t("model_tab.invalid_price"))
      return
    }
    setBusy(true)
    const res = await listModel(token, p)
    setBusy(false)
    onToast(res.ok ? t("model_tab.listed") : res.error ?? t("model_tab.error"))
    setListing(null)
    setPrice("")
  }

  async function submitTransfer(token: number) {
    const id = parseInt(transferId, 10)
    if (!id || id <= 0) {
      onToast(t("model_tab.invalid_id"))
      return
    }
    setBusy(true)
    const res = await transferModel(token, id)
    setBusy(false)
    onToast(res.ok ? t("model_tab.transferred") : res.error ?? t("model_tab.error"))
    setTransfer(null)
    setTransferId("")
  }

  async function submitSell(token: number) {
    setBusy(true)
    const res = await sellModel(token)
    setBusy(false)
    onToast(res.ok ? t("model_tab.sold", { price: (res.price ?? 55000).toLocaleString("ru") }) : res.error ?? t("model_tab.error"))
  }

  const mine = modelState.mine ?? []
  const market = modelState.market ?? []
  const noOwn = mine.length === 0
  const hidden = soldOut && noOwn

  const tonAddress = useTonAddress()

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("model_tab.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("model_tab.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshModels()
            void refreshModelHistory()
          }}
          aria-label={t("model_tab.refresh")}
          className="grid size-10 place-items-center rounded-2xl border border-border bg-secondary text-muted-foreground active:scale-90"
        >
          <RefreshCw className="size-5" />
        </button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-bold">TON Connect</p>
        <p className="mt-1 text-xs text-muted-foreground">Подключи кошелек — нужно для TON App Review</p>
        <div className="mt-3">
          <TonConnectButton />
        </div>
        {tonAddress && <p className="mt-2 truncate text-xs text-muted-foreground">{tonAddress.slice(0, 6)}…{tonAddress.slice(-4)}</p>}
      </div>

      {hidden ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-10 text-center">
          <EyeOff className="size-8 text-muted-foreground" />
          <p className="text-sm font-semibold">{t("model_tab.sold_out_others")}</p>
          <p className="text-xs text-muted-foreground">{t("model_tab.sold_out_others_note")}</p>
        </div>
      ) : (
        <ModelViewer src={meta.glb} />
      )}

      <div className="rounded-2xl border border-[#ffd700]/30 bg-[#ffd700]/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crown className="size-4 text-[#ffd700]" />
            {t("model_tab.limited_mint", { claimed: modelState.claimed, supply: modelState.supply })}
          </div>
          <div className="text-sm font-bold text-[#ffd700]">
            {modelState.claimed === modelState.supply ? t("model_tab.sold_out") : t("model_tab.left", { remaining: modelState.remaining })}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ffd700]/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ffd700] to-[#ff9d00] transition-all"
            style={{ width: `${modelState.supply > 0 ? Math.round((modelState.claimed / modelState.supply) * 100) : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("model_tab.supply_note")}
        </p>
      </div>

      {!hidden && mine.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border py-8 text-center">
          <Gem className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {t("model_tab.no_model")}
          </p>
        </div>
      )}

      {!hidden && mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">{t("model_tab.my_models")}</h2>
          <div className="space-y-3">
            {mine.map((m) => (
              <div key={m.token_id} className="rounded-2xl border border-[#ffd700]/30 bg-card p-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold">
                    💎 {t("model_tab.instance", { token: m.token_id })} <span className="text-xs font-medium text-muted-foreground">/ 20</span>
                  </p>
                  {m.sale_price_stars > 0 && (
                    <span className="rounded-lg bg-[#ffd700]/15 px-2 py-0.5 text-xs font-bold text-[#ffd700]">
                      {t("model_tab.on_sale", { price: m.sale_price_stars })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("model_tab.income")} · {m.last_income_at ? t("model_tab.income_accruing") : t("model_tab.income_not_accrued")}
                </p>

                {listing === m.token_id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      placeholder={t("model_tab.price_placeholder")}
                      className="w-full min-w-0 rounded-xl border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitList(m.token_id)}
                      className="shrink-0 rounded-xl bg-[#ffd700] px-3 py-2 text-xs font-bold text-black active:scale-95 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : "OK"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setListing(null)}
                      className="shrink-0 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground active:scale-95"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.sale_price_stars > 0 ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true)
                          const r = await unlistModel(m.token_id)
                          setBusy(false)
                          onToast(r.ok ? t("model_tab.unlisted") : r.error ?? t("model_tab.error"))
                        }}
                        className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold active:scale-95"
                      >
                        {t("model_tab.unlist")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setListing(m.token_id)
                          setPrice("")
                        }}
                        className="rounded-xl bg-[#ffd700] px-3 py-2 text-xs font-bold text-black active:scale-95"
                      >
                        {t("model_tab.list")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setTransfer(m.token_id)
                        setTransferId("")
                      }}
                      className="flex items-center gap-1 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold active:scale-95"
                    >
                      <Send className="size-3.5" /> {t("model_tab.transfer")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitSell(m.token_id)}
                      className="flex items-center gap-1 rounded-xl bg-[#ffd700]/15 px-3 py-2 text-xs font-bold text-[#ffd700] active:scale-95 disabled:opacity-50"
                    >
                      <Star className="size-3.5" /> {t("model_tab.sell")}
                    </button>
                    {transfer === m.token_id && (
                      <div className="flex w-full gap-2">
                        <input
                          value={transferId}
                          onChange={(e) => setTransferId(e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          placeholder={t("model_tab.transfer_id_placeholder")}
                          className="w-full min-w-0 rounded-xl border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => submitTransfer(m.token_id)}
                          className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : t("model_tab.transfer")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!hidden && market.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">{t("model_tab.marketplace")}</h2>
          <div className="space-y-3">
            {market.map((m) => (
              <div key={m.token_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                <span className="grid size-11 place-items-center rounded-xl bg-[#ffd700]/10 text-xl">💎</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{t("model_tab.instance", { token: m.token_id })}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {m.seller_nick || t("model_tab.seller")} · {t("model_tab.fee")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (stars < m.sale_price_stars) {
                      onToast(t("model_tab.no_stars"))
                      return
                    }
                    setBusy(true)
                    const r = await buyModel(m.token_id)
                    setBusy(false)
                    onToast(r.ok ? t("model_tab.bought") : r.error ?? t("model_tab.error"))
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-[#ffd700] px-3 py-2 text-xs font-bold text-black active:scale-95 disabled:opacity-50"
                >
                  <Star className="size-3.5 fill-black" /> {m.sale_price_stars}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {modelHistory.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
            <History className="size-5 text-[#ffd700]" /> {t("model_tab.history")}
          </h2>
          <div className="space-y-3">
            {modelHistory.map((m) => (
              <div key={m.model_id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#ffd700]/10 text-lg">{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("model_tab.limited_mint", { claimed: m.claimed, supply: m.supply })}
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-secondary/60 px-2 py-1.5">
                    <p className="text-muted-foreground">{t("model_tab.released")}</p>
                    <p className="mt-0.5 font-semibold">
                      {fmtDateTime(m.events.find((e) => e.event_type === "release")?.created_at ?? m.events[m.events.length - 1]?.created_at ?? "", lang)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-secondary/60 px-2 py-1.5">
                    <p className="text-muted-foreground">{t("model_tab.last_claim")}</p>
                    <p className="mt-0.5 font-semibold">
                      {m.events.find((e) => e.event_type === "claimed") ? fmtDateTime(m.events.find((e) => e.event_type === "claimed")!.created_at, lang) : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {m.events.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">{t("model_tab.no_events")}</p>
                  ) : (
                    m.events.map((e) => {
                      const who = e.nick || t("model_tab.anonymous")
                      const whoText =
                        e.event_type === "claimed"
                          ? t("model_tab.event_claimed", { who })
                          : e.event_type === "bought"
                            ? t("model_tab.event_bought", { who, price: Number(e.details || 0).toLocaleString(lang) })
                            : e.event_type === "transfer"
                              ? t("model_tab.event_transfer", { who })
                              : e.event_type === "burned"
                                ? t("model_tab.event_burned", { who, price: Number(e.details || 0).toLocaleString(lang) })
                                : null
                      return (
                        <div key={e.id} className="flex items-center gap-2 rounded-xl bg-background/50 px-2.5 py-1.5">
                          <span className="text-sm">
                            {e.event_type === "release" ? "🗓️" : e.event_type === "claimed" ? "🎉" : e.event_type === "bought" ? "💸" : e.event_type === "transfer" ? "🔁" : e.event_type === "burned" ? "🔥" : "•"}
                          </span>
                          <p className="min-w-0 flex-1 truncate text-xs">
                            {e.event_type === "release" ? (
                              <span className="font-semibold">{t("model_tab.event_release")}</span>
                            ) : (
                              <>
                                <span className="font-semibold">{whoText}</span>
                                {e.token_id != null && (
                                  <span className="ml-1 text-muted-foreground">#{e.token_id}</span>
                                )}
                              </>
                            )}
                          </p>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtDateTime(e.created_at, lang)}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-dashed border-border p-4">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-bold">{t("model_tab.ton")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("model_tab.ton_note")}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={tonBusy}
          onClick={() => {
            setTonBusy(true)
            setTimeout(() => {
              setTonBusy(false)
              onToast(t("model_tab.ton_soon"))
            }, 600)
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ffd700]/40 bg-[#ffd700]/10 py-2.5 text-sm font-semibold text-[#ffd700] active:scale-[0.98] disabled:opacity-50"
        >
          {tonBusy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          {t("model_tab.connect_ton")}
        </button>
      </section>
    </div>
  )
}
