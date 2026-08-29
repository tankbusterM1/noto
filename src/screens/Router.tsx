import { useUI } from '../store/ui'
import { Today } from './Today'
import { Notes } from './Notes'
import { Editor } from './Editor'
import { Loom } from './Loom'
import { Queue } from './Queue'
import { Review } from './Review'
import { Journal } from './Journal'
import { Todos } from './Todos'
import { Watch } from './Watch'
import { Bytes } from './Bytes'
import { Trash } from './Trash'

/** Maps the active screen to its component. */
export function Router() {
  const screen = useUI((s) => s.screen)
  switch (screen) {
    case 'today':
      return <Today />
    case 'notes':
      return <Notes />
    case 'editor':
      return <Editor />
    case 'loom':
      return <Loom />
    case 'queue':
      return <Queue />
    case 'review':
      return <Review />
    case 'journal':
      return <Journal />
    case 'todos':
      return <Todos />
    case 'watch':
      return <Watch />
    case 'bytes':
      return <Bytes />
    case 'trash':
      return <Trash />
  }
}
