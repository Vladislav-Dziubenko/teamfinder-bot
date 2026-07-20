// Звуки рулетки на Web Audio API — без внешних файлов, генерируются на лету.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  // мобильные браузеры стартуют контекст в suspended до жеста пользователя
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

export function setMuted(v: boolean) {
  muted = v
  if (master) master.gain.value = v ? 0 : 0.5
}

export function isMuted() {
  return muted
}

// Короткий «тик» — щелчок при прохождении предмета через маркер
export function tick(pitch = 1) {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = "square"
  osc.frequency.setValueAtTime(1400 * pitch, t)
  osc.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.03)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.06)
}

// Восходящий аккорд-победа. rank: 0 (обычное) → 4 (легендарка/премиум)
export function win(rank = 0) {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  // базовые аккорды, чем выше редкость — тем «богаче» и выше
  const chords = [
    [523.25, 659.25], // C E
    [523.25, 659.25, 783.99], // C E G
    [587.33, 739.99, 880.0], // D F# A
    [659.25, 830.61, 987.77, 1318.51], // E G# B E
    [659.25, 830.61, 987.77, 1318.51, 1567.98], // + G
  ]
  const notes = chords[Math.min(rank, chords.length - 1)]
  notes.forEach((f, i) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = i === 0 ? "triangle" : "sine"
    const start = t + i * 0.06
    osc.frequency.setValueAtTime(f, start)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9)
    osc.connect(g).connect(master!)
    osc.start(start)
    osc.stop(start + 0.95)
  })
  // блеск сверху для редких
  if (rank >= 3) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(2093, t + 0.25)
    osc.frequency.exponentialRampToValueAtTime(3136, t + 0.5)
    g.gain.setValueAtTime(0.0001, t + 0.25)
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    osc.connect(g).connect(master)
    osc.start(t + 0.25)
    osc.stop(t + 0.75)
  }
}

// Низкий «вжух» на старте прокрутки
export function whoosh() {
  const c = ac()
  if (!c || !master || muted) return
  const t = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = "sawtooth"
  osc.frequency.setValueAtTime(120, t)
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.35)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + 0.42)
}
