// Provably-fair верификация кейсов: сервер выводит ролл детерминированно из
// sha256(server_seed:client_seed:nonce) — здесь клиент повторяет те же вычисления
// (см. _fair_pick в webapp/server.py) и сверяет результат.

export type FairProof = {
  seed_version?: number
  seed_hash?: string
  client_seed?: string
  nonce?: number
  nonces?: number[]
  rotate_every?: number
  revealed_seed?: string
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function bytesToBig(hex: string, offsetBytes: number, lenBytes: number): bigint {
  let v = BigInt(0)
  for (let i = 0; i < lenBytes; i++) {
    v = (v << BigInt(8)) | BigInt(parseInt(hex.slice((offsetBytes + i) * 2, (offsetBytes + i + 1) * 2), 16))
  }
  return v
}

// Старшие 8 байт хэша (BE) — ролл для выбора обычного предмета.
export function rollValue(hexDigest: string): bigint {
  return bytesToBig(hexDigest, 0, 8)
}

// Следующие 8 байт (BE) % 1000 — джекпот-ролл (0.1%).
export function jackpotRoll(hexDigest: string): number {
  return Number(bytesToBig(hexDigest, 8, 8) % BigInt(1000))
}

export type CaseItemForVerify = {
  key: string
  weight: number
  jackpot?: boolean
}

export type VerifyResult = {
  verifiable: boolean
  hashOk: boolean
  rollOk: boolean
  expectedKey: string | null
  jackpotValue: number
}

// Проверка одного открытия. verifiable: false — сид ещё не раскрыт,
// проверить можно только после ротации (revealed_seed).
export async function verifyCaseProof(
  proof: FairProof,
  items: CaseItemForVerify[],
  expectedKey: string,
): Promise<VerifyResult> {
  if (!proof || !proof.client_seed || proof.nonce == null || !proof.revealed_seed || !proof.seed_hash) {
    return { verifiable: false, hashOk: false, rollOk: false, expectedKey: null, jackpotValue: -1 }
  }
  const digest = await sha256Hex(`${proof.revealed_seed}:${proof.client_seed}:${proof.nonce}`)
  const hashOk = digest === proof.seed_hash
  const normal = items.filter((i) => !i.jackpot)
  const totalWeight = normal.reduce((s, i) => s + i.weight, 0)
  const pick = Number(rollValue(digest) % BigInt(totalWeight))
  const jackpotValue = jackpotRoll(digest)
  let expectedKeyOut: string | null = null
  let current = 0
  for (const it of normal) {
    current += it.weight
    if (pick < current) {
      expectedKeyOut = it.key
      break
    }
  }
  if (expectedKeyOut === null && normal.length > 0) expectedKeyOut = normal[normal.length - 1].key
  const jackpotItem = items.find((i) => i.jackpot)
  if (jackpotItem && jackpotValue === 0) expectedKeyOut = jackpotItem.key
  const rollOk = hashOk && expectedKeyOut === expectedKey
  return { verifiable: true, hashOk, rollOk, expectedKey: expectedKeyOut, jackpotValue }
}
