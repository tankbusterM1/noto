/*
 * Keep an installed PWA from running a stale build.
 *
 * vite-plugin-pwa's generated `registerSW.js` only calls `register()`. The
 * worker itself is built with skipWaiting + clientsClaim, so a new build
 * installs, activates and claims the open page immediately — but *nothing
 * reloads it*. The window keeps executing the OLD bundle until its next
 * navigation, so every deploy appeared one launch late.
 *
 * Fix: reload once when a NEW worker takes control, and keep checking for fresh
 * builds while the window is open (an installed PWA can be left running for
 * days, and would otherwise never notice a deploy).
 */

const UPDATE_EVERY_MS = 60_000

export function keepAppFresh(): void {
  if (!('serviceWorker' in navigator)) return

  // Only a *takeover* warrants a reload. The first worker to claim this page
  // (fresh install — the page already fetched the current bundle from the
  // network) must flip the flag rather than reload, or we'd flash on first run.
  // NB: this is deliberately mutable, not captured once: a page that starts
  // uncontrolled and is later claimed must still reload on the NEXT update.
  let hasController = !!navigator.serviceWorker.controller
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true // first claim — adopt it silently
      return
    }
    if (reloading) return
    reloading = true
    // Safe mid-edit: the editor flushes its pending autosave on `pagehide`.
    window.location.reload()
  })

  // Ask the browser to re-fetch sw.js periodically and whenever the window comes
  // back to the foreground, so a long-lived window still picks up new builds.
  void navigator.serviceWorker.ready.then((reg) => {
    const check = () => void reg.update().catch(() => {})
    setInterval(check, UPDATE_EVERY_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  })
}
