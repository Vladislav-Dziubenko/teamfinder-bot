"use client"

// Генерирует сторис-карточку 1080×1920 для шаринга в Telegram Stories / пересылки.
// QR ведёт на https://t.me/<bot>?start=<refCode>
export async function generateStoryCard(opts: {
  refCode: string
  botUsername: string
  userNick: string
  userAvatar?: string | null
  stats?: { wins?: number; level?: number | string }
}): Promise<Blob> {
  const W = 1080
  const H = 1920
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  // BG gradient dark
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, "#0c0a14")
  g.addColorStop(0.5, "#141028")
  g.addColorStop(1, "#1a0f2e")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // Gold glow
  ctx.fillStyle = "rgba(255,215,0,0.08)"
  ctx.beginPath()
  ctx.ellipse(W / 2, 520, 420, 320, 0, 0, Math.PI * 2)
  ctx.fill()
  // Card
  const cardY = 120
  const cardH = 1680
  const r = 48
  ctx.fillStyle = "rgba(255,255,255,0.06)"
  roundRect(ctx, 40, cardY, W - 80, cardH, r)
  ctx.fill()
  ctx.strokeStyle = "rgba(255,215,0,0.35)"
  ctx.lineWidth = 4
  ctx.stroke()
  // NEXUS badge
  ctx.fillStyle = "#ffd700"
  ctx.font = "900 72px system-ui"
  ctx.textAlign = "center"
  ctx.fillText("NEXUS", W / 2, cardY + 140)
  ctx.fillStyle = "rgba(255,255,255,0.7)"
  ctx.font = "600 28px system-ui"
  ctx.fillText("TEAMHUB", W / 2, cardY + 185)
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.font = "400 26px system-ui"
  ctx.fillText("поиск тиммейтов", W / 2, cardY + 225)
  // Avatar
  const avY = cardY + 320
  ctx.save()
  ctx.beginPath()
  ctx.arc(W / 2, avY, 110, 0, Math.PI * 2)
  ctx.clip()
  if (opts.userAvatar) {
    try {
      const img = await loadImage(opts.userAvatar)
      ctx.drawImage(img, W / 2 - 110, avY - 110, 220, 220)
    } catch {
      drawPlaceholder(ctx, W / 2, avY)
    }
  } else {
    drawPlaceholder(ctx, W / 2, avY)
  }
  ctx.restore()
  ctx.strokeStyle = "#ffd700"
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(W / 2, avY, 110, 0, Math.PI * 2)
  ctx.stroke()
  // Nick
  ctx.fillStyle = "#fff"
  ctx.font = "800 44px system-ui"
  ctx.textAlign = "center"
  ctx.fillText(opts.userNick || "Игрок NEXUS", W / 2, avY + 180)
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.font = "500 24px system-ui"
  ctx.fillText(`приглашает в команду`, W / 2, avY + 225)
  // Stats pills
  const pillY = avY + 300
  drawPill(ctx, W / 2 - 220, pillY, `🏆 ${opts.stats?.wins ?? 0} побед`)
  drawPill(ctx, W / 2 + 20, pillY, `⚡ Ур. ${opts.stats?.level ?? "—"}`)
  // Big CTA
  ctx.fillStyle = "#fff"
  ctx.font = "900 52px system-ui"
  ctx.fillText("Найди свою", W / 2, pillY + 160)
  ctx.fillStyle = "#ffd700"
  ctx.fillText("команду мечты", W / 2, pillY + 235)
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.font = "400 26px system-ui"
  ctx.fillText("по игре, рангу и вайбу — без токсиков", W / 2, pillY + 285)
  // QR
  const qrSize = 380
  const qrY = pillY + 380
  const qrX = W / 2 - qrSize / 2
  // white bg for QR
  ctx.fillStyle = "#fff"
  roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 32)
  ctx.fill()
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(
    `https://t.me/${opts.botUsername}?start=${opts.refCode}`,
  )}`
  try {
    const qrImg = await loadImage(qrUrl)
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
  } catch {
    ctx.fillStyle = "#000"
    ctx.font = "600 24px system-ui"
    ctx.textAlign = "center"
    ctx.fillText("QR", W / 2, qrY + qrSize / 2)
  }
  // QR caption
  ctx.fillStyle = "#fff"
  ctx.font = "700 28px system-ui"
  ctx.fillText("Сканируй → /start", W / 2, qrY + qrSize + 70)
  ctx.fillStyle = "rgba(255,255,255,0.55)"
  ctx.font = "500 22px system-ui"
  ctx.fillText(`t.me/${opts.botUsername}?start=${opts.refCode}`, W / 2, qrY + qrSize + 110)
  // Bottom hint
  ctx.fillStyle = "rgba(255,255,255,0.4)"
  ctx.font = "500 20px system-ui"
  ctx.fillText("Поделись в сторис • получи +30⭐ за друга", W / 2, H - 80)
  // Convert to blob
  return await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), "image/png", 0.92),
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.fillStyle = "rgba(255,255,255,0.08)"
  ctx.strokeStyle = "rgba(255,255,255,0.12)"
  ctx.lineWidth = 2
  roundRect(ctx, x, y, 200, 56, 28)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = "#fff"
  ctx.font = "700 22px system-ui"
  ctx.textAlign = "center"
  ctx.fillText(text, x + 100, y + 36)
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#2a2340"
  ctx.beginPath()
  ctx.arc(x, y, 110, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#ffd700"
  ctx.font = "900 64px system-ui"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("N", x, y + 8)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}
