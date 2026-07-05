import type { Folder, Note } from './types'

/** Folder-tree helpers (pure). Ported from the prototype's tree methods. */

export function folderById(folders: Folder[], id: string): Folder | undefined {
  return folders.find((f) => f.id === id)
}

export function kidsOf(folders: Folder[], id: string | null): Folder[] {
  return folders.filter((f) => f.parentId === id)
}

export function notesIn(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.folderId === id)
}

/** Notes directly in `id` plus everything in its descendant folders. */
export function countRec(folders: Folder[], notes: Note[], id: string): number {
  return (
    notesIn(notes, id).length +
    kidsOf(folders, id).reduce((a, k) => a + countRec(folders, notes, k.id), 0)
  )
}

/** Root → … → folder chain. */
export function pathOf(folders: Folder[], id: string): Folder[] {
  const p: Folder[] = []
  let f = folderById(folders, id)
  while (f) {
    p.unshift(f)
    f = f.parentId ? folderById(folders, f.parentId) : undefined
  }
  return p
}

export function folderName(folders: Folder[], id: string): string {
  return folderById(folders, id)?.name ?? ''
}

/** "Systems / Distributed" */
export function folderPath(folders: Folder[], id: string): string {
  return pathOf(folders, id)
    .map((f) => f.name)
    .join(' / ')
}
