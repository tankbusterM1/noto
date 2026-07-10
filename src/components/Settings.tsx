import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useUI, ACCENTS } from '../store/ui'
import { useData, type SyncOutcome } from '../store/data'
import { MONO, SERIF } from '../lib/ui'
import { CloseIcon } from './icons'

const label: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
  marginBottom: 12,
}
const rowBtn: CSSProperties = {
  border: '1px solid var(--ln)',
  background: 'transparent',
  color: 'var(--ink2)',
  borderRadius: 9,
  padding: '9px 14px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export function Settings() {
  const settingsOpen = useUI((s) => s.settingsOpen)
  const closeSettings = useUI((s) => s.closeSettings)
  const dark = useUI((s) => s.dark)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const accent = useUI((s) => s.accent)
  const setAccent = useUI((s) => s.setAccent)
  const inkFade = useUI((s) => s.inkFade)
  const setInkFade = useUI((s) => s.setInkFade)
  const showToast = useUI((s) => s.showToast)
  const exportData = useData((s) => s.exportData)
  const importData = useData((s) => s.importData)
  const resetData = useData((s) => s.resetData)
  const setGithubToken = useData((s) => s.setGithubToken)
  const setGithubRepo = useData((s) => s.setGithubRepo)
  const savedRepo = useData((s) => s.githubRepo)
  const syncNow = useData((s) => s.syncNow)
  const fileRef = useRef<HTMLInputElement>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState(savedRepo)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<SyncOutcome | null>(null)

  // Settings mounts before the vault hydrates, so the first `useState` captures
  // the default rather than the saved repo. Adopt it once it arrives.
  useEffect(() => setRepo(savedRepo), [savedRepo])

  if (!settingsOpen) return null

  const doSync = async () => {
    setSyncing(true)
    setSyncNote(null)
    // Persist both before syncing, so a failed sync doesn't lose what was typed.
    if (repo.trim()) await setGithubRepo(repo)
    if (token.trim()) await setGithubToken(token)
    const outcome = await syncNow()
    setSyncNote(outcome)
    setSyncing(false)
    if (outcome.ok) showToast(outcome.message)
  }

  const doExport = async () => {
    const json = await exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `noto-vault-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Vault exported')
  }
  const doImport = async (file?: File | null) => {
    if (!file) return
    const ok = await importData(await file.text())
    if (ok) {
      showToast('Vault imported — reloading')
      setTimeout(() => location.reload(), 500)
    }
  }
  const confirmReset = async () => {
    await resetData()
    location.reload()
  }

  const seg = (active: boolean): CSSProperties => ({
    flex: 1,
    border: 'none',
    borderRadius: 7,
    padding: '8px 0',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: active ? 'var(--sf)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink2)',
    transition: 'all 0.15s ease',
  })

  return (
    <>
      <div onClick={closeSettings} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(24,19,10,0.42)', animation: 'fadein 0.2s ease both' }} />
      <div style={{ position: 'fixed', top: '12%', left: 0, right: 0, margin: '0 auto', width: 460, maxWidth: '92vw', zIndex: 151, background: 'var(--bg)', border: '1px solid var(--ln)', borderRadius: 18, boxShadow: '0 30px 80px rgba(24,19,10,0.3)', overflow: 'hidden', animation: 'rise 0.25s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--ln)' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>Settings</span>
          <span style={{ flex: 1 }} />
          <div className="circle-btn" onClick={closeSettings} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid var(--ln)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>
            <CloseIcon size={10} />
          </div>
        </div>

        <div style={{ padding: '20px 22px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Appearance */}
          <div style={label}>Appearance</div>
          <div style={{ display: 'flex', gap: 3, background: 'var(--sf2)', borderRadius: 9, padding: 3, marginBottom: 16 }}>
            <button style={seg(!dark)} onClick={() => dark && toggleTheme()}>Light</button>
            <button style={seg(dark)} onClick={() => !dark && toggleTheme()}>Dark</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Accent</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAccent(a.value)}
                  title={a.name}
                  className="press-sm"
                  style={{ width: 24, height: 24, borderRadius: 99, background: a.value, cursor: 'pointer', border: accent === a.value ? '2px solid var(--ink)' : '2px solid var(--ln)', boxShadow: accent === a.value ? '0 0 0 2px var(--bg) inset' : undefined, transition: 'border-color 0.15s ease' }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Ink fade</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>Notes lose opacity as memory decays</div>
            </div>
            <button
              onClick={() => setInkFade(!inkFade)}
              className="press-sm"
              title={inkFade ? 'On' : 'Off'}
              style={{ width: 42, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', background: inkFade ? 'var(--ac)' : 'var(--sf2)', position: 'relative', transition: 'background 0.2s ease' }}
            >
              <span style={{ position: 'absolute', top: 3, left: inkFade ? 21 : 3, width: 18, height: 18, borderRadius: 99, background: 'var(--bg)', transition: 'left 0.2s cubic-bezier(0.65,0,0.35,1)' }} />
            </button>
          </div>

          <div style={{ height: 1, background: 'var(--ln)', margin: '22px 0' }} />

          {/* Sync — one private repo, shared with the phone. */}
          <div style={label}>Sync · private GitHub repo</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 12 }}>
            Everything — notes, folders, review history, todos, watch later, and the <em>encrypted</em>{' '}
            journal — is merged into the private repo you name below. Noto creates it if it doesn't exist,
            and never picks one for you. Each sync is one commit. Journal entries are pushed as ciphertext
            only; if you haven't set a passphrase, they stay on this machine.
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 12 }}>
            The token is kept in this browser's database, unencrypted — a browser has no keychain. Anyone
            with your computer and your account can read it. Scope it to this one repo, and revoke it if the
            machine is shared. (On iPhone it's sealed in the Keychain behind Face ID.)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="which repo? e.g. my-vault"
              spellCheck={false}
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', fontSize: 12.5, fontFamily: MONO, borderRadius: 9, border: `1px solid ${repo.trim() ? 'var(--ln)' : 'var(--g1)'}`, background: 'var(--sf2)', color: 'var(--ink)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--ink3)', flexShrink: 0 }}>name, or paste its URL</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub token with access to that repo"
              style={{ flex: 1, minWidth: 200, padding: '9px 12px', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 9, border: '1px solid var(--ln)', background: 'var(--sf2)', color: 'var(--ink)' }}
            />
            <button
              className="border-hover"
              style={{ ...rowBtn, ...(repo.trim() ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}
              disabled={syncing || !repo.trim()}
              onClick={doSync}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          {syncNote && (
            <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: syncNote.ok ? 'var(--ink2)' : 'var(--g1)' }}>
              {syncNote.message}
              {!!syncNote.plaintextHeld && (
                <div style={{ marginTop: 4, color: 'var(--ink3)' }}>
                  {syncNote.plaintextHeld} journal {syncNote.plaintextHeld === 1 ? 'entry' : 'entries'} held back —
                  set a passphrase to sync {syncNote.plaintextHeld === 1 ? 'it' : 'them'}.
                </div>
              )}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--ln)', margin: '22px 0' }} />

          {/* Data */}
          <div style={label}>Your data · local-first</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 14 }}>
            Everything lives in this browser (IndexedDB). Export a portable JSON backup — it's unencrypted and holds your whole vault, so keep the file somewhere safe — or import one to merge it in (matching notes are updated, the rest are added).
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="border-hover" style={rowBtn} onClick={doExport}>Export vault</button>
            <button className="border-hover" style={rowBtn} onClick={() => fileRef.current?.click()}>Import vault</button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => doImport(e.target.files?.[0])} />
            <span style={{ flex: 1 }} />
            {!resetArmed && (
              <button
                className="del-btn"
                style={{ ...rowBtn, color: 'var(--ink3)' }}
                onClick={() => setResetArmed(true)}
              >
                {import.meta.env.DEV ? 'Reset to sample data' : 'Erase all data'}
              </button>
            )}
          </div>

          {/* Explicit confirmation — the app's most destructive action. */}
          {resetArmed && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, padding: '12px 14px', background: 'var(--sf2)', border: '1px solid var(--g1)', borderRadius: 11, animation: 'fadein 0.2s ease both' }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--g1)', fontWeight: 600 }}>
                  {import.meta.env.DEV ? 'Reset to sample data?' : 'Erase everything?'}
                </span>{' '}
                {import.meta.env.DEV
                  ? 'Your current vault is replaced with the sample set.'
                  : 'Every note, todo, journal entry and review is deleted from this browser. This cannot be undone.'}
              </span>
              <button className="border-hover" style={{ ...rowBtn, flexShrink: 0 }} onClick={() => setResetArmed(false)}>
                Cancel
              </button>
              <button
                style={{ ...rowBtn, flexShrink: 0, background: 'var(--g1)', color: '#fff', borderColor: 'var(--g1)' }}
                onClick={confirmReset}
              >
                {import.meta.env.DEV ? 'Reset' : 'Erase everything'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
