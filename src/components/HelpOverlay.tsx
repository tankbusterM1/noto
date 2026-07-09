import type { CSSProperties, ReactNode } from 'react'
import { useUI } from '../store/ui'
import { MONO, SERIF } from '../lib/ui'
import { CloseIcon } from './icons'

/*
 * The '?' cheatsheet — every fast path in Noto on one card. The app grew a
 * real keyboard vocabulary (palette, weaving, grading, modes); this makes it
 * discoverable instead of tribal knowledge.
 */

const kbd: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  color: 'var(--ink2)',
  border: '1px solid var(--ln)',
  borderBottomWidth: 2,
  borderRadius: 6,
  padding: '2px 7px',
  background: 'var(--sf)',
  whiteSpace: 'nowrap',
}
const groupLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9.5,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--am)',
  marginBottom: 10,
}

function Row({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4.5px 0' }}>
      <span style={{ display: 'flex', gap: 4, flexShrink: 0, minWidth: 86 }}>
        {keys.map((k) => (
          <span key={k} style={kbd}>
            {k}
          </span>
        ))}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{children}</span>
    </div>
  )
}

export function HelpOverlay() {
  const helpOpen = useUI((s) => s.helpOpen)
  const closeHelp = useUI((s) => s.closeHelp)
  if (!helpOpen) return null

  return (
    <>
      <div onClick={closeHelp} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(24,19,10,0.42)', animation: 'fadein 0.2s ease both' }} />
      <div style={{ position: 'fixed', top: '9%', left: 0, right: 0, margin: '0 auto', width: 660, maxWidth: '94vw', zIndex: 151, background: 'var(--bg)', border: '1px solid var(--ln)', borderRadius: 18, boxShadow: '0 30px 80px rgba(24,19,10,0.3)', overflow: 'hidden', animation: 'rise 0.25s cubic-bezier(0.3,0.7,0.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--ln)' }}>
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>The fast paths</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: 'var(--ink3)', marginLeft: 12 }}>press ? anywhere</span>
          <span style={{ flex: 1 }} />
          <div className="circle-btn" onClick={closeHelp} style={{ width: 28, height: 28, borderRadius: 99, border: '1px solid var(--ln)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>
            <CloseIcon size={10} />
          </div>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 34px', maxHeight: '72vh', overflowY: 'auto' }}>
          <div>
            <div style={groupLabel}>Everywhere</div>
            <Row keys={['⌘K']}>search everything · run actions · create a note</Row>
            <Row keys={['⌘\\']}>hide / show the sidebar — full-screen writing</Row>
            <Row keys={['?']}>this sheet</Row>
            <Row keys={['esc']}>close whatever is on top</Row>

            <div style={{ ...groupLabel, marginTop: 18 }}>Review session</div>
            <Row keys={['1', '2', '3', '4']}>grade — again · hard · good · easy</Row>
            <Row keys={['esc']}>end the session</Row>
          </div>

          <div>
            <div style={groupLabel}>In the editor</div>
            <Row keys={['[[']}>weave picker — link notes, ranked by context</Row>
            <Row keys={['select']}>weave bar — link · branch · bold · italic</Row>
            <Row keys={['r-click']}>format palette — headings, lists, code, links</Row>
            <Row keys={['⌘B', '⌘I']}>bold · italic</Row>
            <Row keys={['⌘E']}>reading ⇄ edit mode</Row>
            <Row keys={['⌘S']}>save now (it autosaves anyway)</Row>
            <Row keys={['⌘click']}>follow a [[wikilink]] — creates it if missing</Row>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--ln)', padding: '10px 24px', fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: 'var(--ink3)', textAlign: 'center' }}>
          write · weave · review — the rest is muscle memory
        </div>
      </div>
    </>
  )
}
