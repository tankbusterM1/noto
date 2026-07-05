import { useRef, useState, type CSSProperties } from 'react'
import { useUI, ACCENTS } from '../store/ui'
import { useData } from '../store/data'
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [resetArmed, setResetArmed] = useState(false)

  if (!settingsOpen) return null

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
  const doReset = async () => {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
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

          {/* Data */}
          <div style={label}>Your data · local-first</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 14 }}>
            Everything lives in this browser (IndexedDB). Export a portable JSON backup, or restore one.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="border-hover" style={rowBtn} onClick={doExport}>Export vault</button>
            <button className="border-hover" style={rowBtn} onClick={() => fileRef.current?.click()}>Import vault</button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => doImport(e.target.files?.[0])} />
            <span style={{ flex: 1 }} />
            <button
              className="del-btn"
              style={{ ...rowBtn, color: resetArmed ? 'var(--g1)' : 'var(--ink3)', borderColor: resetArmed ? 'var(--g1)' : 'var(--ln)' }}
              onClick={doReset}
              onMouseLeave={() => setResetArmed(false)}
            >
              {resetArmed ? 'Click again to reset' : 'Reset to sample data'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
