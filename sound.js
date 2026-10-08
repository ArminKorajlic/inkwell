// A small synthesized bell (no audio files): a few inharmonic partials with
// fast attack and long, staggered decays — like a desk / meditation bell.
// Works with a live AudioContext or an OfflineAudioContext (for tests).

const PARTIALS = [
  { r: 1, a: 1, d: 2.2 },      // fundamental — the long ring
  { r: 2.76, a: 0.45, d: 1.2 },
  { r: 5.4, a: 0.22, d: 0.6 },
  { r: 8.93, a: 0.1, d: 0.3 }, // bright strike transient
]

function strike(ctx, out, when, freq) {
  const nodes = []
  for (const p of PARTIALS) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq * p.r
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(p.a, when + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, when + p.d)
    o.connect(g)
    g.connect(out)
    o.start(when)
    o.stop(when + p.d + 0.05)
    nodes.push(o)
  }
  return nodes
}

// Schedule `strikes` dings starting `delay` seconds from now.
// Returns { endsAt, cancel } — cancel() silences a bell that hasn't finished.
export function playBell(ctx, { strikes = 1, delay = 0, freq = 880, gap = 0.6, volume = 0.22 } = {}) {
  const out = ctx.createGain()
  out.gain.value = volume
  out.connect(ctx.destination)
  const t0 = ctx.currentTime + Math.max(0, delay) + 0.02
  const oscs = []
  for (let i = 0; i < strikes; i++) oscs.push(...strike(ctx, out, t0 + i * gap, i === 0 ? freq : freq * 0.94))
  const endsAt = t0 + (strikes - 1) * gap + PARTIALS[0].d
  return {
    endsAt,
    cancel() {
      for (const o of oscs) { try { o.stop() } catch { /* not started yet or already stopped */ } }
      try { out.disconnect() } catch { /* already disconnected */ }
    },
  }
}
