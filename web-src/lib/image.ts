"use client"

/** Ужимает картинку под maxSide px (сохраняя пропорции) в JPEG.
 * Лечит главную причину OOM: сырые фото с телефона (2-5 МБ) раньше
 * сохранялись в профиль как есть и потом летали в КАЖДОМ сообщении
 * чата (5+ МБ на поллинг) — сервер душился большими JSON-ответами. */
export function downscalePhoto(file: File, maxSide = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const cv = document.createElement("canvas")
        cv.width = w
        cv.height = h
        cv.getContext("2d")?.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL("image/jpeg", quality))
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
