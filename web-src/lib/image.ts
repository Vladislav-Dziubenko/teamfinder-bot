"use client"

// Сервер принимает data URL не длиннее 100 КБ. Оставляем небольшой запас для
// префикса и JSON-запроса: так фотография с телефона не упадёт с 400.
const AVATAR_MAX_DATA_URL_LENGTH = 96_000

/** Диагностика в серверные логи: без неё "bad image" не отличить от пустого
 *  файла / неподдерживаемого формата / битого WebView. */
export function diagImageError(tab: string, stage: string, file: File | null, err: unknown): void {
  try {
    const name = err instanceof Error ? err.name : typeof err
    const msg = err instanceof Error ? err.message : String(err ?? "")
    navigator.sendBeacon?.(
      "/api/client-error",
      new Blob(
        [JSON.stringify({
          message: `img ${stage}: ${name} ${msg} | size=${file?.size ?? -1} type=${file?.type || "?"}`.slice(0, 300),
          tab,
          url: location.href,
        })],
        { type: "application/json" },
      ),
    )
  } catch {}
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Нулевые размеры = битый декод (WebView иногда "успешно" грузит мусор).
      if (!img.width || !img.height) reject(new Error("zero size image"))
      else resolve(img)
    }
    img.onerror = () => reject(new Error("decode failed"))
    img.src = src
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ""))
    fr.onerror = () => reject(fr.error || new Error("read failed"))
    fr.readAsDataURL(file)
  })
}

type DecodedSource =
  | { kind: "bitmap"; bmp: ImageBitmap }
  | { kind: "img"; img: HTMLImageElement; revoke?: () => void }

/** Декодирует файл тремя стратегиями (первая сработавшая побеждает):
 *  1. createImageBitmap — лучше всего в WebView + чинит EXIF-поворот
 *     телефонных фото (imageOrientation: from-image);
 *  2. FileReader -> dataURL -> Image (без blob: URL — работает там,
 *     где WebView режет blob в <img>);
 *  3. Object URL -> Image (legacy-путь).
 *  Пустой файл и мусор отбиваем сразу с понятной ошибкой. */
async function decodeFile(file: File): Promise<DecodedSource> {
  if (!file || file.size === 0) throw new Error("empty file")

  // 1. Bitmap (предпочтительно).
  try {
    const cib = window.createImageBitmap
    if (typeof cib === "function") {
      try {
        const bmp = await cib.call(window, file, { imageOrientation: "from-image" } as ImageBitmapOptions)
        if (bmp.width > 0 && bmp.height > 0) return { kind: "bitmap", bmp }
        try { bmp.close() } catch {}
      } catch {
        const bmp = await cib.call(window, file)
        if (bmp.width > 0 && bmp.height > 0) return { kind: "bitmap", bmp }
        try { bmp.close() } catch {}
      }
    }
  } catch (e) {
    // тихо идём дальше — ниже есть фолбэки, ошибку залогирует вызыватель
  }

  // 2. DataURL (проверенный путь: так уже работает загрузка в профиле).
  try {
    const dataUrl = await readAsDataURL(file)
    if (dataUrl.startsWith("data:image/")) {
      return { kind: "img", img: await loadImage(dataUrl) }
    }
  } catch {}

  // 3. Object URL (старый путь).
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return { kind: "img", img, revoke: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e instanceof Error ? e : new Error("decode failed")
  }
}

function drawSource(
  ctx: CanvasRenderingContext2D,
  src: DecodedSource,
  w: number, h: number,
): void {
  if (src.kind === "bitmap") ctx.drawImage(src.bmp, 0, 0, w, h)
  else ctx.drawImage(src.img, 0, 0, w, h)
}

function compressAvatar(
  src: DecodedSource, maxSide: number, quality: number,
): string {
  const sw = src.kind === "bitmap" ? src.bmp.width : src.img.width
  const sh = src.kind === "bitmap" ? src.bmp.height : src.img.height
  const sourceSide = Math.max(sw, sh)
  let outputSide = Math.min(maxSide, sourceSide)
  let outputQuality = quality

  try {
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const scale = outputSide / sourceSide
      const w = Math.max(1, Math.round(sw * scale))
      const h = Math.max(1, Math.round(sh * scale))
      const cv = document.createElement("canvas")
      cv.width = w
      cv.height = h
      const ctx = cv.getContext("2d")
      if (!ctx) throw new Error("no 2d context")
      drawSource(ctx, src, w, h)
      const dataUrl = cv.toDataURL("image/jpeg", outputQuality)
      if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) return dataUrl
      outputSide = Math.max(96, Math.round(outputSide * 0.78))
      outputQuality = Math.max(0.55, outputQuality - 0.06)
    }
  } finally {
    if (src.kind === "bitmap") {
      try { src.bmp.close() } catch {}
    } else if (src.revoke) {
      try { src.revoke() } catch {}
    }
  }

  throw new Error("avatar_too_large")
}

/** Ужимает dataURL-картинку под maxSide px (для уже загруженных
 * больших аватарок из стора перед сохранением на сервер). */
export function downscaleDataUrl(dataUrl: string, maxSide = 192, quality = 0.8): Promise<string> {
  return (async () => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) throw new Error("bad image")
    const img = await loadImage(dataUrl).catch(() => {
      throw new Error("bad image")
    })
    return compressAvatar({ kind: "img", img }, maxSide, quality)
  })()
}

/** Ужимает картинку под maxSide px (сохраняя пропорции) в JPEG.
 * Лечит главную причину OOM: сырые фото с телефона (2-5 МБ) раньше
 * сохранялись в профиль как есть и потом летали в КАЖДОМ сообщении
 * чата (5+ МБ на поллинг) — сервер душился большими JSON-ответами. */
export function downscalePhoto(file: File, maxSide = 192, quality = 0.8): Promise<string> {
  return (async () => {
    const src = await decodeFile(file)
    return compressAvatar(src, maxSide, quality)
  })()
}
