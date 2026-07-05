import { db, type FolderRow, type NoteRow, type SrsRow, type LedgerRow, type WatchRow } from './db'
import { todayEpochDay } from '../lib/dates'
import type {
  Block,
  Goal,
  Grade,
  JournalEntry,
  Ranged,
  Ritual,
  Todo,
  Watch,
  WeekItem,
} from '../lib/types'

/*
 * Seed data — ported verbatim from the prototype (Noto.dc.html). Relative
 * offsets (created/updated/due/hist.d/journal.off) are converted to absolute
 * epoch-days at seed time so scheduling is anchored; the display-relative demo
 * tables (week days, ranged day-of-month, watch "added") stay as authored.
 */

interface SeedNote {
  id: string
  title: string
  folderId: string
  tags: string[]
  created: number
  updated: number
  blocks: Block[]
}

interface SeedSrs {
  ease: number
  ivl: number
  due: number
  hist: { d: number; g: Grade; ivl: number }[]
}

export const SEED_FOLDERS: FolderRow[] = [
  { id: 'f1', name: 'Computer Science', parentId: null },
  { id: 'f2', name: 'Algorithms', parentId: 'f1' },
  { id: 'f3', name: 'Systems', parentId: 'f1' },
  { id: 'f4', name: 'Distributed', parentId: 'f3' },
  { id: 'f5', name: 'AI / ML', parentId: null },
  { id: 'f6', name: 'Engineering', parentId: null },
  { id: 'f7', name: 'Web', parentId: 'f6' },
  { id: 'f8', name: 'DevOps', parentId: 'f6' },
]

export const SEED_NOTES: SeedNote[] = [
  { id: 'n1', title: 'B-Trees & Database Indexes', folderId: 'f3', tags: ['systems', 'databases', 'storage'], created: -30, updated: -2, blocks: [
    { t: 'p', text: 'Databases live and die by disk seeks. A B-tree keeps the tree short and fat so any row is a handful of page reads away.' },
    { t: 'h2', text: 'Why fan-out beats depth' },
    { t: 'ul', items: ['One node = one disk page (4–16 KB), holding hundreds of keys', 'Height stays 3–4 even for billions of rows', 'Leaves are linked — range scans become sequential reads'] },
    { t: 'code', lang: 'sql', text: '-- covering index for the hot query\nCREATE INDEX idx_orders_user_created\n  ON orders (user_id, created_at DESC)\n  INCLUDE (status, total);' },
    { t: 'q', text: 'Index the query you actually run — not the table you happen to have.' },
  ] },
  { id: 'n2', title: 'Transformer Self-Attention', folderId: 'f5', tags: ['ml', 'transformers', 'attention'], created: -21, updated: -1, blocks: [
    { t: 'p', text: 'Attention lets every token look at every other token and decide what matters. No recurrence, no convolution — just weighted lookups over the whole sequence.' },
    { t: 'h2', text: 'The soft dictionary intuition' },
    { t: 'ul', items: ['Query — what this token is looking for', 'Key — what each token offers', 'Value — what each token hands over if matched', 'softmax(QKᵀ/√d) turns match scores into mixing weights'] },
    { t: 'code', lang: 'python', text: 'def attention(Q, K, V, mask=None):\n    scores = Q @ K.transpose(-2, -1) / math.sqrt(d_k)\n    if mask is not None:\n        scores = scores.masked_fill(mask == 0, -1e9)\n    return softmax(scores, dim=-1) @ V' },
    { t: 'h2', text: 'Multi-head' },
    { t: 'p', text: 'Run h attention functions in parallel over projected slices, then concatenate. Each head learns a different relation — syntax, position, coreference.' },
    { t: 'img', text: 'Attention heatmap — layer 5, head 3 lighting up on coreference' },
    { t: 'link', text: 'Attention Is All You Need — the original paper', domain: 'arxiv.org' },
    { t: 'q', text: 'A lookup table where the match is fuzzy and everything is returned — just in different amounts.' },
  ] },
  { id: 'n3', title: 'TCP Congestion Control', folderId: 'f3', tags: ['systems', 'networking'], created: -18, updated: -7, blocks: [
    { t: 'p', text: 'TCP probes the network for capacity and backs off when it senses loss. The result is the famous sawtooth.' },
    { t: 'ul', items: ['Slow start — cwnd doubles every RTT until ssthresh', 'Congestion avoidance — additive increase, +1 MSS per RTT', 'On loss — multiplicative decrease, cwnd halves (AIMD)', 'Fast retransmit on 3 duplicate ACKs, no full timeout'] },
    { t: 'q', text: 'Be aggressive until the network pushes back; then back off fast and creep up slow.' },
  ] },
  { id: 'n4', title: 'Master Theorem, finally', folderId: 'f2', tags: ['complexity', 'recursion'], created: -15, updated: -4, blocks: [
    { t: 'p', text: 'For divide-and-conquer recurrences T(n) = a·T(n/b) + f(n): compare f(n) against n^log_b(a) — whoever dominates, wins.' },
    { t: 'code', lang: 'txt', text: 'T(n) = a·T(n/b) + f(n)\n\ncase 1  f slower  → Θ(n^log_b a)        binary search: Θ(log n)\ncase 2  f equal   → Θ(n^log_b a · log n) merge sort: Θ(n log n)\ncase 3  f faster  → Θ(f(n))             (needs regularity)' },
    { t: 'ul', items: ['a = number of subproblems, n/b = their size', 'Case 2 is where the log factor comes from', 'If f is polynomially close to n^log_b(a), the theorem is silent'] },
  ] },
  { id: 'n5', title: 'Dijkstra vs A*', folderId: 'f2', tags: ['interview-prep', 'graphs', 'search'], created: -40, updated: -10, blocks: [
    { t: 'p', text: 'Both grow a frontier of cheapest-first paths. A* just gets a hint about where the goal is.' },
    { t: 'ul', items: ['Dijkstra expands by g(n) — blind but exact', 'A* expands by g(n) + h(n); admissible h keeps it exact', 'h = 0 turns A* back into Dijkstra; h = true distance makes it walk the answer'] },
    { t: 'code', lang: 'python', text: 'def dijkstra(graph, src):\n    dist, pq = {src: 0}, [(0, src)]\n    while pq:\n        d, u = heapq.heappop(pq)\n        if d > dist.get(u, 1e18): continue\n        for v, w in graph[u]:\n            if d + w < dist.get(v, 1e18):\n                dist[v] = d + w\n                heapq.heappush(pq, (d + w, v))\n    return dist' },
  ] },
  { id: 'n6', title: 'CAP Theorem, honestly', folderId: 'f4', tags: ['systems', 'distributed'], created: -25, updated: -1, blocks: [
    { t: 'p', text: 'During a partition you must choose: refuse some requests (consistency) or serve possibly-stale data (availability). No partition, no trade-off.' },
    { t: 'ul', items: ['CP — banks, leader election, etcd/ZooKeeper', 'AP — carts, feeds, DNS; reconcile later', 'PACELC: even without partitions, you trade latency vs consistency'] },
    { t: 'call', text: 'Interview move: never say “pick two” — say partitions force the C-vs-A choice.' },
    { t: 'q', text: 'CAP is not a menu of three — partitions happen, so you are really choosing between C and A.' },
  ] },
  { id: 'n7', title: 'Gradient Descent Variants', folderId: 'f5', tags: ['ml', 'optimization'], created: -9, updated: -2, blocks: [
    { t: 'ul', items: ['SGD — noisy but cheap; the baseline', 'Momentum — velocity term smooths the noise', 'RMSProp — per-parameter learning rates', 'Adam — momentum + RMSProp; the default'] },
    { t: 'code', lang: 'python', text: 'm = b1*m + (1-b1)*g        # first moment\nv = b2*v + (1-b2)*g**2     # second moment\ntheta -= lr * m_hat / (v_hat**0.5 + eps)' },
    { t: 'q', text: 'Start with Adam at 3e-4, then earn anything fancier.' },
  ] },
  { id: 'n8', title: 'React Reconciliation & Keys', folderId: 'f7', tags: ['react', 'perf'], created: -12, updated: -3, blocks: [
    { t: 'p', text: 'React diffs trees level by level. Keys tell it which children are the same entity across renders — identity, not order.' },
    { t: 'ul', items: ['Index-as-key breaks on reorder: state sticks to positions', 'Different element type = tear down whole subtree', 'Stable keys → moves become cheap patches'] },
    { t: 'code', lang: 'jsx', text: '{items.map(item => (\n  <Row key={item.id} data={item} />  // identity, not index\n))}' },
  ] },
  { id: 'n9', title: 'Virtual Memory & Paging', folderId: 'f3', tags: ['os', 'memory'], created: 0, updated: 0, blocks: [
    { t: 'p', text: 'Every process gets a flat fake address space; the MMU translates it page-by-page to whatever physical frames are free.' },
    { t: 'ul', items: ['Page ≈ 4 KB; translation cached in the TLB', 'TLB miss → page-table walk; page fault → disk, five orders slower', 'Working set beats page count — locality is everything'] },
  ] },
  { id: 'n10', title: 'Docker Networking Basics', folderId: 'f8', tags: ['docker', 'devops'], created: -6, updated: -5, blocks: [
    { t: 'p', text: 'Containers get their own network namespace; Docker wires them together with virtual bridges and NAT.' },
    { t: 'ul', items: ['bridge — default; containers talk via docker0', 'host — no isolation, container shares the host stack', 'Compose services resolve each other by name via embedded DNS'] },
    { t: 'code', lang: 'bash', text: 'docker network create appnet\ndocker run -d --network appnet --name api api:latest\ndocker run -d --network appnet -p 8080:80 web:latest' },
  ] },
]

export const SEED_SRS: Record<string, SeedSrs | null> = {
  n1: { ease: 2.5, ivl: 7, due: -2, hist: [{ d: -16, g: 3, ivl: 4 }, { d: -9, g: 3, ivl: 7 }] },
  n2: { ease: 2.35, ivl: 4, due: 0, hist: [{ d: -12, g: 2, ivl: 2 }, { d: -8, g: 3, ivl: 4 }] },
  n3: { ease: 2.5, ivl: 6, due: 5, hist: [{ d: -7, g: 3, ivl: 6 }] },
  n4: { ease: 2.2, ivl: 3, due: -1, hist: [{ d: -10, g: 1, ivl: 1 }, { d: -9, g: 2, ivl: 1 }, { d: -4, g: 3, ivl: 3 }] },
  n5: { ease: 2.7, ivl: 10, due: 0, hist: [{ d: -24, g: 3, ivl: 5 }, { d: -10, g: 4, ivl: 10 }] },
  n6: { ease: 2.6, ivl: 9, due: 8, hist: [{ d: -14, g: 3, ivl: 5 }, { d: -1, g: 4, ivl: 9 }] },
  n7: { ease: 2.5, ivl: 2, due: 0, hist: [{ d: -2, g: 2, ivl: 2 }] },
  n8: { ease: 2.5, ivl: 6, due: 2, hist: [{ d: -4, g: 3, ivl: 6 }] },
  n9: null,
  n10: null,
}

export const SEED_TODOS: Todo[] = [
  { id: 't1', text: 'Review due notes in the queue', tag: 'noto', done: false },
  { id: 't2', text: 'OS assignment 3 — paging simulator', tag: 'cs330', done: false, ref: { type: 'note', id: 'n9' } },
  { id: 't3', text: 'LeetCode: 2 graph problems', tag: 'interview-prep', done: true, ref: { type: 'note', id: 'n5' } },
  { id: 't4', text: 'Watch Karpathy GPT lecture', tag: 'ml', done: false, ref: { type: 'watch', id: 'v1' } },
  { id: 't5', text: 'Push graph-viz refactor', tag: 'side', done: true },
  { id: 't6', text: 'Email prof about project topic', tag: 'admin', done: false },
]

export const SEED_GOALS: Goal[] = [
  { id: 'g1', text: 'Clear the review backlog to zero', done: false },
  { id: 'g2', text: 'Finish CS330 problem set 3', done: false },
  { id: 'g3', text: 'Read 2 papers and note them in Noto', done: true },
]

export const SEED_WEEK: WeekItem[] = [
  { id: 'w1', day: 0, text: 'Quiz: networks ch. 5', done: true },
  { id: 'w2', day: 0, text: 'Gym', done: true },
  { id: 'w3', day: 1, text: 'Paper club — AIAYN', done: true },
  { id: 'w4', day: 2, text: 'CS330 PS due 11:59pm', done: false },
  { id: 'w5', day: 3, text: 'Mock interview w/ Dev', done: false, tag: 'interview-prep' },
  { id: 'w6', day: 4, text: 'Ship personal site v2', done: false },
  { id: 'w7', day: 5, text: 'Long review session', done: false },
  { id: 'w8', day: 5, text: 'Clean desk + backups', done: false },
  { id: 'w9', day: 6, text: 'Weekly review + plan', done: false },
]

export const SEED_RITUALS: Ritual[] = [
  { id: 'r1', text: 'Clear the review queue', streak: 12, done: false },
  { id: 'r2', text: 'Read 20 minutes', streak: 5, done: true },
  { id: 'r3', text: 'Plan tomorrow in 3 lines', streak: 9, done: false },
]

export const SEED_RANGED: Ranged[] = [
  { id: 'rg1', text: 'CS330 final project', from: 1, to: 14, hue: 215 },
  { id: 'rg2', text: 'Internship applications', from: 10, to: 24, hue: 28 },
]

export const SEED_WATCH: Watch[] = [
  { id: 'v1', kind: 'video', title: "Let's build GPT from scratch, in code", source: 'Karpathy · YouTube', mins: 116, url: 'youtube.com/watch?v=kCc8FmEb1nY', added: '2d ago', done: false, hue: 358, tags: ['ml', 'deep-dive'], note: 'Watch with the nanoGPT repo open. Pause at the attention section and re-derive the shapes by hand.' },
  { id: 'v2', kind: 'video', title: 'Attention in transformers, visually explained', source: '3Blue1Brown · YouTube', mins: 26, url: 'youtube.com/watch?v=eMlx5fFNoYc', added: '3d ago', done: true, hue: 215, tags: ['ml'], note: '' },
  { id: 'v3', kind: 'article', title: 'The Log: what every software engineer should know', source: 'LinkedIn Engineering', mins: 18, url: 'engineering.linkedin.com/distributed-systems/log', added: '4d ago', done: false, hue: 165, tags: ['systems', 'deep-dive'], note: 'Kafka origins — pairs with the CAP note.' },
  { id: 'v4', kind: 'paper', title: 'Attention Is All You Need', source: 'arXiv 1706.03762', mins: 45, url: 'arxiv.org/abs/1706.03762', added: '1w ago', done: false, hue: 262, tags: ['ml', 'weekend'], note: '' },
  { id: 'v5', kind: 'video', title: 'MIT 6.006 — Dynamic Programming I', source: 'MIT OCW', mins: 51, url: 'ocw.mit.edu/courses/6-006', added: '1w ago', done: false, hue: 205, tags: ['interview-prep'], note: 'Do rod-cutting right after.' },
  { id: 'v6', kind: 'article', title: 'Latency numbers every programmer should know', source: 'GitHub gist', mins: 5, url: 'gist.github.com/jboner/2841832', added: '2w ago', done: true, hue: 32, tags: ['systems', 'interview-prep'], note: '' },
]

export const SEED_JOURNAL: JournalEntry[] = [
  { off: -1, words: 214, text: 'Finally understood why B-tree fan-out matters — fewer levels means fewer disk seeks, and everything else is commentary. Also: do not debug CSS at 1am.' },
  { off: -2, words: 156, text: 'Attention clicked today. It is just a soft dictionary lookup — Q asks, K matches, V answers. Wrote it from scratch without peeking.' },
  { off: -3, words: 98, text: 'Slow day. Reviewed congestion control; AIMD finally feels obvious instead of memorized. Sawtooth graphs everywhere I look now.' },
  { off: -5, words: 187, text: 'Set up Noto and migrated scattered notes from six different apps. The ink-fade idea is going to keep me honest about reviewing.' },
]

export const SEED_TAGS_POOL = ['ml', 'systems', 'deep-dive', 'interview-prep', 'weekend']

/** Fixed base for seed watch sort keys — safely below any real Date.now(). */
const WATCH_BASE = 1_000_000_000_000

/** First-run population. Converts offsets → absolute epoch-days. */
export async function seedDatabase(): Promise<void> {
  const T = todayEpochDay()

  const noteRows: NoteRow[] = SEED_NOTES.map((n) => ({
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    tags: n.tags,
    createdDay: T + n.created,
    updatedDay: T + n.updated,
    blocks: n.blocks,
  }))

  const srsRows: SrsRow[] = []
  const ledgerRows: LedgerRow[] = []
  for (const [noteId, s] of Object.entries(SEED_SRS)) {
    if (!s) continue
    srsRows.push({ noteId, ease: s.ease, ivl: s.ivl, dueDay: T + s.due })
    for (const h of s.hist) {
      ledgerRows.push({ noteId, day: T + h.d, grade: h.g, ivl: h.ivl })
    }
  }

  await db.transaction(
    'rw',
    [db.folders, db.notes, db.srs, db.ledger, db.todos, db.goals, db.week, db.rituals, db.ranged, db.watch, db.journal, db.meta],
    async () => {
      await db.folders.bulkAdd(SEED_FOLDERS)
      await db.notes.bulkAdd(noteRows)
      await db.srs.bulkAdd(srsRows)
      await db.ledger.bulkAdd(ledgerRows)
      await db.todos.bulkAdd(SEED_TODOS)
      await db.goals.bulkAdd(SEED_GOALS)
      await db.week.bulkAdd(SEED_WEEK)
      await db.rituals.bulkAdd(SEED_RITUALS)
      await db.ranged.bulkAdd(SEED_RANGED)
      const watchRows: WatchRow[] = SEED_WATCH.map((w, i) => ({ ...w, addedAt: WATCH_BASE - i }))
      await db.watch.bulkAdd(watchRows)
      await db.journal.bulkAdd(SEED_JOURNAL)
      await db.meta.bulkAdd([
        { key: 'tagsPool', value: SEED_TAGS_POOL },
        { key: 'installDay', value: T },
      ])
    },
  )
}
