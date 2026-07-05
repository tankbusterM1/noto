import type { CSSProperties } from 'react'
import { useData } from '../store/data'
import { useUI } from '../store/ui'
import { PROMPTS } from '../lib/constants'
import { addDays, fmtShort } from '../lib/dates'
import { MONO, SERIF, kicker, clamp } from '../lib/ui'
import { LockIcon, QuillIcon } from '../components/icons'

const microLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
}

export function Journal() {
  const journal = useData((s) => s.journal)
  const jLocked = useUI((s) => s.jLocked)
  const jMode = useUI((s) => s.jMode)
  const jSaved = useUI((s) => s.jSaved)
  const setJMode = useUI((s) => s.setJMode)
  const saveJournal = useUI((s) => s.saveJournal)
  const toggleJournalLock = useUI((s) => s.toggleJournalLock)
  const unlockJournal = useUI((s) => s.unlockJournal)

  const now = new Date()
  const jStreak = '◆ ' + (jSaved ? 7 : 6) + '-day streak'
  const jPrompt = PROMPTS[now.getDate() % PROMPTS.length]
  const jWeekDots = [6, 5, 4, 3, 2, 1, 0].map((k) => ({
    filled: (k === 0 && jSaved) || journal.some((e) => e.off === -k),
    today: k === 0,
  }))
  const entries = journal.map((e) => ({
    date: addDays(e.off).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    words: e.words,
    text: e.text,
  }))

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
          <div style={kicker}>Daily journal</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', margin: '6px 0 0' }}>Journal</h1>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              className="border-hover press-98"
              onClick={toggleJournalLock}
              title={jLocked ? 'Unlock journal' : 'Blur & lock journal'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--ln)',
                borderRadius: 999,
                padding: '5px 11px',
                cursor: 'pointer',
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: jLocked ? 'var(--ink)' : 'var(--ink2)',
                background: jLocked ? 'var(--sf2)' : undefined,
                transition: 'all 0.2s ease',
              }}
            >
              <LockIcon locked={jLocked} />
              {jLocked ? 'locked' : 'lock'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--am)', fontWeight: 600 }}>{jStreak}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
            {jWeekDots.map((d, i) => (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 5,
                  borderRadius: 99,
                  background: d.filled ? 'var(--am)' : 'var(--sf2)',
                  transition: 'background 0.4s ease',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Blur-gated body */}
      <div style={{ position: 'relative' }}>
        <div style={{ transition: 'filter 0.5s ease', filter: jLocked ? 'blur(9px)' : 'blur(0px)', pointerEvents: jLocked ? 'none' : undefined, userSelect: jLocked ? 'none' : undefined }}>
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
                {/* STUB: entry text is not persisted — Save flips the streak (matches prototype). */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  data-ph="Start writing — it stays between you and the page…"
                  style={{ minHeight: 230, fontFamily: SERIF, fontSize: 17, lineHeight: 1.8, color: 'var(--ink)', outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--ln)', paddingTop: 14, marginTop: 18 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--ink3)' }}>
                    {jSaved ? 'saved today · private' : 'autosaves · private'}
                  </span>
                  <button
                    className="btn-dark"
                    onClick={saveJournal}
                    style={{ background: jSaved ? 'var(--g4)' : 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease' }}
                  >
                    {jSaved ? '✓ Saved' : 'Save entry'}
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
                <div
                  contentEditable
                  suppressContentEditableWarning
                  data-ph="Fragments, ideas, half-thoughts, rants…"
                  style={{ minHeight: 110, marginTop: 12, fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.75, color: 'var(--ink)', outline: 'none' }}
                />
              </div>
            </div>

            {/* Earlier entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ ...microLabel, fontSize: 10.5, letterSpacing: '0.15em', padding: '0 2px' }}>Earlier entries</div>
              {entries.map((e, i) => (
                <div
                  key={i}
                  className="border-hover"
                  style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 14, padding: '15px 18px', cursor: 'pointer', animation: 'rise 0.4s ease both', animationDelay: `${Math.min(i * 0.045, 0.4)}s` }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 500 }}>{e.date}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)' }}>{e.words} words</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6, fontFamily: SERIF, ...clamp(2) }}>{e.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {jLocked && (
          <div style={{ position: 'absolute', inset: -12, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadein 0.35s ease both' }}>
            <div style={{ background: 'var(--sf)', border: '1px solid var(--ln)', borderRadius: 18, padding: '28px 34px', textAlign: 'center', boxShadow: '0 18px 44px rgba(30,24,12,0.14)', maxWidth: 300 }}>
              <div style={{ width: 40, height: 40, margin: '0 auto 12px', borderRadius: 99, background: 'var(--sf2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--am)' }}>
                <LockIcon size={16} locked />
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500 }}>This journal is private.</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55, marginTop: 6 }}>Entries stay on this device and blur when locked.</div>
              <button className="btn-dark" onClick={unlockJournal} style={{ marginTop: 14, background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Unlock
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
