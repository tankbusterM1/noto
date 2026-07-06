import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { PROMPTS } from '../lib/constants'
import { addDays, fmtShort } from '../lib/dates'
import { journalStreak } from '../lib/format'
import { MONO, SERIF, kicker, clamp } from '../lib/ui'
import { LockIcon, QuillIcon } from '../components/icons'

const microLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}
const passInput: CSSProperties = {
  width: '100%',
  border: '1px solid var(--ln)',
  borderRadius: 9,
  padding: '9px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  background: 'var(--bg)',
  outline: 'none',
}
const darkBtn: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--bg)',
  border: 'none',
  borderRadius: 9,
  padding: '9px 16px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export function Journal() {
  const journal = useData((s) => s.journal)
  const scratchpad = useData((s) => s.scratchpad)
  const journalCrypto = useData((s) => s.journalCrypto)
  const journalKey = useData((s) => s.journalKey)
  const saveJournalEntry = useData((s) => s.saveJournalEntry)
  const saveScratchpad = useData((s) => s.saveScratchpad)
  const setJournalPassphrase = useData((s) => s.setJournalPassphrase)
  const unlockJournalCrypto = useData((s) => s.unlockJournalCrypto)
  const lockJournalCrypto = useData((s) => s.lockJournalCrypto)
  const jLocked = useUI((s) => s.jLocked)
  const jMode = useUI((s) => s.jMode)
  const setJMode = useUI((s) => s.setJMode)
  const toggleJournalLock = useUI((s) => s.toggleJournalLock)
  const unlockJournal = useUI((s) => s.unlockJournal)
  const showToast = useUI((s) => s.showToast)

  const hasPassphrase = journalCrypto !== null
  const unlocked = journalKey !== null
  const locked = hasPassphrase ? !unlocked : jLocked

  const editorRef = useRef<HTMLDivElement>(null)
  const scratchRef = useRef<HTMLDivElement>(null)
  const [unlockPass, setUnlockPass] = useState('')
  const [setupPass, setSetupPass] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)

  const now = new Date()
  const todayEntry = journal.find((e) => e.off === 0)
  const hasToday = !!todayEntry
  const streak = journalStreak(journal)
  const jStreak = '◆ ' + streak + '-day streak'
  const jPrompt = PROMPTS[now.getDate() % PROMPTS.length]
  const jWeekDots = [6, 5, 4, 3, 2, 1, 0].map((k) => ({
    filled: journal.some((e) => e.off === -k),
    today: k === 0,
  }))
  const earlier = journal.filter((e) => e.off < 0)

  // Echo — the page you wrote exactly a week / month / half-year / year ago
  // today. Journals compound: the longer you keep one, the further it echoes.
  const ECHOES: [number, string][] = [
    [-365, 'one year ago today'],
    [-180, 'six months ago today'],
    [-30, 'one month ago today'],
    [-7, 'a week ago today'],
  ]
  const echo = ECHOES.map(([off, label]) => ({ e: journal.find((x) => x.off === off), label })).find((x) => x.e)

  // (Re)load stored content whenever lock state changes (uncontrolled editors).
  const loadKey = `${hasPassphrase}-${unlocked}`
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerText = todayEntry?.text ?? ''
    if (scratchRef.current) scratchRef.current.innerText = scratchpad
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])

  const onLockToggle = () => {
    if (hasPassphrase) {
      if (unlocked) lockJournalCrypto()
    } else {
      toggleJournalLock()
    }
  }
  const doUnlock = async () => {
    if (hasPassphrase) {
      const ok = await unlockJournalCrypto(unlockPass)
      if (ok) setUnlockPass('')
    } else {
      unlockJournal()
    }
  }
  const doSetup = async () => {
    await setJournalPassphrase(setupPass)
    setSetupPass('')
    setSetupOpen(false)
  }

  const seg = (active: boolean): CSSProperties => ({
    fontFamily: MONO,
    fontSize: 9.5,
    padding: '4px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    color: active ? 'var(--ink)' : 'var(--ink2)',
    background: active ? 'var(--sf)' : 'transparent',
    fontWeight: active ? 600 : undefined,
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '44px 48px 120px', animation: 'fadein 0.3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={kicker}>Daily journal{hasPassphrase ? ' · encrypted' : ''}</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Journal</h1>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              className="border-hover press-98"
              onClick={onLockToggle}
              title={locked ? 'Locked' : hasPassphrase ? 'Lock journal' : 'Blur & lock journal'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--ln)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer', fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: locked ? 'var(--ink)' : 'var(--ink2)', background: locked ? 'var(--sf2)' : undefined, transition: 'all 0.2s ease' }}
            >
              <LockIcon locked={locked} />
              {locked ? 'locked' : 'lock'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--am)', fontWeight: 600 }}>{jStreak}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
            {jWeekDots.map((d, i) => (
              <div key={i} style={{ width: 20, height: 5, borderRadius: 99, background: d.filled ? 'var(--am)' : d.today ? 'transparent' : 'var(--sf2)', border: !d.filled && d.today ? '1px dashed var(--ink3)' : undefined, transition: 'background 0.4s ease' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Blur-gated body */}
      <div style={{ position: 'relative' }}>
        <div key={loadKey} style={{ transition: 'filter 0.5s ease', filter: locked ? 'blur(9px)' : 'blur(0px)', pointerEvents: locked ? 'none' : undefined, userSelect: locked ? 'none' : undefined }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              {/* Today card */}
              <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, padding: '28px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={microLabel}>Today · {fmtShort(now)}</div>
                  <div style={{ display: 'flex', gap: 3, background: 'var(--sf2)', borderRadius: 8, padding: 3 }}>
                    <div onClick={() => setJMode('prompt')} style={seg(jMode === 'prompt')}>prompted</div>
                    <div onClick={() => setJMode('blank')} style={seg(jMode === 'blank')}>blank page</div>
                  </div>
                </div>
                {jMode === 'prompt' ? (
                  <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, color: 'var(--ink2)', margin: '14px 0 18px', lineHeight: 1.5, animation: 'fadein 0.3s ease both' }}>
                    "{jPrompt}"
                  </div>
                ) : (
                  <div style={{ margin: '14px 0 6px', borderTop: '1px dashed var(--ln)' }} />
                )}
                <div ref={editorRef} contentEditable suppressContentEditableWarning data-ph="Start writing — it stays between you and the page…" style={{ minHeight: 230, fontFamily: SERIF, fontSize: 17, lineHeight: 1.8, color: 'var(--ink)', outline: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--ln)', paddingTop: 14, marginTop: 18 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
                    {hasPassphrase ? 'encrypted · this device' : hasToday ? 'saved today · private' : 'private to this device'}
                  </span>
                  <button className="btn-dark" onClick={() => saveJournalEntry(editorRef.current?.innerText ?? '')} style={{ background: hasToday ? 'var(--g4)' : 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}>
                    {hasToday ? '✓ Saved' : 'Save entry'}
                  </button>
                </div>
              </div>

              {/* Scratchpad */}
              <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <QuillIcon style={{ color: 'var(--am)', transform: 'translateY(1px)' }} />
                  <span style={microLabel}>Scratchpad</span>
                  <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink3)' }}>— no dates, no rules</span>
                </div>
                <div ref={scratchRef} contentEditable suppressContentEditableWarning onBlur={() => saveScratchpad(scratchRef.current?.innerText ?? '')} data-ph="Fragments, ideas, half-thoughts, rants…" style={{ minHeight: 110, marginTop: 12, fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.75, color: 'var(--ink)', outline: 'none' }} />
              </div>
            </div>

            {/* Earlier entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {echo?.e && (
                <div style={{ background: 'var(--sf)', border: '1px dashed var(--am)', borderRadius: 14, padding: '15px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ ...microLabel, color: 'var(--am)' }}>Echo · {echo.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>{echo.e.words} words</span>
                  </div>
                  <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6, marginTop: 8, ...clamp(3) }}>
                    “{echo.e.text}”
                  </div>
                </div>
              )}
              <div style={{ ...microLabel, fontSize: 10.5, letterSpacing: '0.15em', padding: '0 2px' }}>Earlier entries</div>
              {earlier.map((e, i) => (
                <div key={e.id ?? i} className="border-hover" style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, padding: '15px 18px', cursor: 'pointer', animation: 'rise 0.4s ease both', animationDelay: `${Math.min(i * 0.045, 0.4)}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500 }}>
                      {addDays(e.off).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>{e.words} words</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6, fontFamily: SERIF, ...clamp(2) }}>{e.text}</div>
                </div>
              ))}
              {earlier.length === 0 && !locked && (
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: 'var(--ink3)', padding: '4px 2px' }}>
                  No earlier entries yet — today is page one.
                </div>
              )}
            </div>
          </div>
        </div>

        {locked && (
          <div style={{ position: 'absolute', inset: -12, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadein 0.35s ease both' }}>
            <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, padding: '28px 34px', textAlign: 'center', boxShadow: '0 18px 44px rgba(30,24,12,0.14)', width: 320 }}>
              <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 99, background: 'var(--sf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--am)' }}>
                <LockIcon size={16} locked />
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500 }}>
                {hasPassphrase ? 'This journal is encrypted.' : 'This journal is private.'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6 }}>
                {hasPassphrase
                  ? 'Enter your passphrase to decrypt it on this device.'
                  : 'Blurred on this device. Set a passphrase to encrypt it for real.'}
              </div>

              {hasPassphrase ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="password"
                    autoFocus
                    value={unlockPass}
                    onChange={(e) => setUnlockPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
                    placeholder="Passphrase"
                    style={passInput}
                  />
                  <button className="btn-dark" onClick={doUnlock} style={darkBtn}>Unlock</button>
                </div>
              ) : setupOpen ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="password"
                    autoFocus
                    value={setupPass}
                    onChange={(e) => setSetupPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSetup()}
                    placeholder="Choose a passphrase (8+ chars)"
                    style={passInput}
                  />
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--g1)', lineHeight: 1.5 }}>
                    No recovery — if you forget it, the entries are unreadable.
                  </div>
                  <button className="btn-dark" onClick={doSetup} style={{ ...darkBtn, background: 'var(--ac)', color: 'var(--acI)' }}>Encrypt journal</button>
                  <button onClick={() => setSetupOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>cancel</button>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn-dark" onClick={unlockJournal} style={darkBtn}>Unlock (blur only)</button>
                  <button onClick={() => setSetupOpen(true)} style={{ background: 'transparent', border: '1px solid var(--ln)', color: 'var(--ink2)', borderRadius: 9, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Encrypt with a passphrase →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Encrypt affordance while viewing an un-encrypted journal */}
      {!hasPassphrase && !locked && (
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sf2)', border: '1px solid var(--ln)', borderRadius: 12, padding: '11px 15px' }}>
          <LockIcon size={13} locked style={{ color: 'var(--am)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: 1 }}>
            This journal isn't encrypted yet. A passphrase makes it unreadable without it — even from the raw database.
          </span>
          {setupOpen ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="password" autoFocus value={setupPass} onChange={(e) => setSetupPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSetup()} placeholder="passphrase" style={{ ...passInput, width: 170 }} />
              <button className="btn-accent" onClick={doSetup} style={{ background: 'var(--ac)', color: 'var(--acI)', border: 'none', borderRadius: 9, padding: '0 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Encrypt</button>
            </div>
          ) : (
            <button onClick={() => (showToast('Choose a passphrase to encrypt'), setSetupOpen(true))} style={{ ...darkBtn, background: 'var(--ink)' }}>Set passphrase</button>
          )}
        </div>
      )}
    </div>
  )
}
