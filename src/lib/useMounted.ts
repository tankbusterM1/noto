import { useEffect, useState } from 'react'

/**
 * Flips true after the first paint, so height/width transitions animate in
 * from their starting value ("bars rise on load", memory band growx, etc.).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return mounted
}
