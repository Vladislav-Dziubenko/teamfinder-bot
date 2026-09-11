"use client"

// Сервер принимает data URL не длиннее 100 КБ. Оставляем небольшой запас для
// префикса и JSON-запроса: так фотография с телефона не упадёт с 400.
const AVATAR_MAX_DATA_URL_LENGTH = 96_000

function compressAvatar(img: HTMLImageElement, maxSide: number, quality: number): string {
  const sourceSide = Math.max(img.width, img.height)
  let outputSide = Math.min(maxSide, sourceSide)
  let outputQuality = quality

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = outputSide / sourceSide
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const cv = document.createElement("canvas")
    cv.width = w
    cv.height = h
    cv.getContext("2d")?.drawImage(img, 0, 0, w, h)
    const dataUrl = cv.toDataURL("image/jpeg", outputQuality)
    if (dataUrl.length <= AVATAR_MAX_DATA_URL_LENGTH) return dataUrl
    outputSide = Math.max(96, Math.round(outputSide * 0.78))
    outputQuality = Math.max(0.55, outputQuality - 0.06)
  }

  throw new Error("avatar_too_large")
}

/** Ужимает dataURL-картинку под maxSide px (для уже загруженных
 * больших аватарок из стора перед сохранением на сервер). */
export function downscaleDataUrl(dataUrl: string, maxSide = 192, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        resolve(compressAvatar(img, maxSide, quality))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error("bad image"))
    img.src = dataUrl
  })
}

/** Ужимает картинку под maxSide px (сохраняя пропорции) в JPEG.
 * Лечит главную причину OOM: сырые фото с телефона (2-5 МБ) раньше
 * сохранялись в профиль как есть и потом летали в КАЖДОМ сообщении
 * чата (5+ МБ на поллинг) — сервер душился большими JSON-ответами. */
export function downscalePhoto(file: File, maxSide = 192, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        resolve(compressAvatar(img, maxSide, quality))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("bad image"))
    }
    img.src = url
  })
}
