// App storage (window.mobius.storage) with forgiving reads and writes, plus
// useSaved: React state that writes itself to one storage key.
import { useCallback, useState } from 'react'

export const store = () => (typeof window !== 'undefined' ? window.mobius?.storage : null)

export async function sget(key, fallback) {
  try { const v = await store()?.get(key); return v == null ? fallback : v }
  catch { return fallback }
}
export async function sset(key, val) {
  try { await store()?.set(key, val); return true } catch { return false }
}
export async function sremove(key) {
  try { await store()?.remove(key); return true } catch { return false }
}

// [value, save, setLocal]: save(next | prev => next) updates state and storage
// together (functional, so quick successive changes never clobber each other);
// setLocal only updates state, for values just loaded from storage.
export function useSaved(key, initial) {
  const [value, setValue] = useState(initial)
  const save = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next
      sset(key, v)
      return v
    })
  }, [key])
  return [value, save, setValue]
}
