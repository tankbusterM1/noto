# Running Noto as a local app

Two worlds, both **100% on this machine** — no internet, no account, no GitHub, no cloud.
Your notes live only in this browser's local database (IndexedDB) on this device.

---

## The two commands you'll actually use

**① Develop — your sandbox**
```
npm run dev
```
Opens <http://localhost:5173> with instant hot-reload. This has its **own separate vault**, so
click around and experiment freely — it can't touch your real notes.

**② Run / update the live app**
```
npm run app
```
Builds the latest and serves the real app at <http://localhost:4173>.

---

## Get a Desktop icon that launches Noto (no console) — easiest

1. `npm run app` **once** (so the app is built).
2. Open the **`launcher`** folder and double-click **`Install Noto.bat`**.
   → It drops a **Noto** icon on your Desktop (this setup window is the only console you'll ever see).
3. Double-click **Noto** on your Desktop. It starts the local server silently and opens Noto in its
   **own app window — no console, no browser tabs.** Right-click it → *Pin to Start / taskbar* if you like.

> The launcher opens Noto in Brave/Chrome/Edge "app mode" (a clean, chromeless window), so it looks
> and feels like a native app.

## …or install it as a PWA (also gives an icon)

1. `npm run app`
2. Open <http://localhost:4173> in Chrome, Edge, or Brave.
3. Click the **Install** icon in the address bar (or ⋮ menu → **Install Noto…**).
4. Noto lives in your **Start Menu / taskbar** with its own window and icon.

> Either way: once cached, Noto **opens even with no server running and no internet** — your notes
> are stored locally on this device.

---

## Push an update to the live app

After you've made changes in dev and you're happy with them:

```
npm run app
```

Run it again — it rebuilds and serves. Next time you open the installed Noto, it **auto-updates**
to your new version. **Your notes are never touched** — they survive every update.

*Prefer to keep a server always on?* Leave one terminal running `npm run serve`, then from another
terminal run `npm run push` whenever you want to ship changes.

---

## Two vaults, on purpose

| | URL | Vault |
|---|---|---|
| **Dev** (`npm run dev`) | localhost:5173 | throwaway sandbox |
| **App** (`npm run app`) | localhost:4173 | **your real notes** |

They're separate so testing in dev never risks your real data. Need to move notes between them
(or make a backup)? **Settings → Export vault** gives you a JSON file; **Import vault** restores it.

---

## Every command

| command | what it does |
|---|---|
| `npm run dev` | development sandbox with hot-reload (:5173) |
| `npm run app` | build **+** serve the real app (:4173) — use this to launch or update |
| `npm run serve` | serve the last build without rebuilding (:4173) |
| `npm run push` | rebuild only (updates a running `serve`) |
| `npm run test` | run the test suite |
| `npm run build` | build to `dist/` only |
