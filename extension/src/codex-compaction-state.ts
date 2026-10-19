/** A metadata-only projection of the native follower stream. Never retain chat/tool bodies. */
type Node = null | string | boolean | Node[] | { [key: string]: Node }
type Path = (string | number)[]
interface Patch { op: string; path: Path; value?: unknown }
const safe = (key: string | number) => !['__proto__', 'prototype', 'constructor'].includes(String(key))

function project(value: unknown, path: Path = []): Node {
  if (path.length > 12) return null
  if (Array.isArray(value)) {
    if (value.length > 20000) throw new Error('Compaction metadata array exceeds limit')
    return value.map((item, i) => project(item, [...path, i]))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, Node> = Object.create(null)
    const last = path.at(-1)
    const allowed = path.length === 0 ? ['turns', 'turnHistory']
      : last === 'turnHistory' ? ['history'] : last === 'history' ? ['entitiesByKey']
      : path.at(-2) === 'turns' || path.at(-2) === 'entitiesByKey' ? ['status', 'items', 'completedItemIds']
      : path.at(-2) === 'items' ? ['id', 'type', 'completed'] : null
    const entries = Object.entries(value)
    if (entries.length > 20000) throw new Error('Compaction metadata map exceeds limit')
    for (const [key, item] of entries) {
      if (!safe(key) || (allowed && !allowed.includes(key))) continue
      // Only retain structural containers, status, item identity and completion flags.
      if (allowed || last === 'entitiesByKey' || last === 'completedItemIds') out[key] = project(item, [...path, key])
    }
    return out
  }
  return typeof value === 'boolean' || typeof value === 'string' && value.length < 256 ? value : null
}

export class CodexCompactionState {
  private state: Node = null
  private revision = -1
  private active = false

  update(change: { type: string; revision: number; baseRevision?: number; conversationState?: unknown; patches?: Patch[] }): boolean {
    let relevant = change.type === 'snapshot'
    if (change.type === 'snapshot') this.state = project(change.conversationState)
    else if (change.type === 'patches') {
      if (change.baseRevision !== this.revision) throw new Error('Compaction stream revision gap')
      for (const patch of change.patches ?? []) relevant = this.patch(patch) || relevant
    } else throw new Error('Unsupported compaction stream change')
    this.revision = change.revision
    if (!relevant) return this.active
    const state = this.state as Record<string, any> | null
    const turns = [...(Array.isArray(state?.turns) ? state.turns : []),
      ...Object.values(state?.turnHistory?.history?.entitiesByKey ?? {})] as any[]
    this.active = turns.some(turn => turn?.status === 'inProgress' && Array.isArray(turn.items)
      && turn.items.some((item: any) => item?.type === 'contextCompaction' && item.completed === false
        && turn.completedItemIds?.[item.id] !== true))
    return this.active
  }

  private patch(patch: Patch): boolean {
    if (!Array.isArray(patch.path) || patch.path.some(key => !safe(key))) throw new Error('Invalid compaction patch path')
    const path = patch.path
    if (!path.length) { this.state = project(patch.value); return true }
    // Reject unrelated patches before touching the projection (including text deltas).
    const turnIndex = path[0] === 'turns' ? 1
      : path[0] === 'turnHistory' && path[1] === 'history' && path[2] === 'entitiesByKey' ? 3 : -1
    const structural = ['turns', 'turnHistory', 'turnHistory/history', 'turnHistory/history/entitiesByKey'].includes(path.join('/'))
    if (!structural && (turnIndex < 0 || path.length > turnIndex + 1 && !['status', 'items', 'completedItemIds'].includes(String(path[turnIndex + 1])))) return false
    const fieldIndex = turnIndex + 1
    if (!structural && path[fieldIndex] === 'items' && path.length > fieldIndex + 2 && !['id', 'type', 'completed'].includes(String(path[fieldIndex + 2]))) return false
    let node: any = this.state
    for (const key of path.slice(0, -1)) {
      if (!node || typeof node !== 'object') return false
      node = node[key]
    }
    if (!node || typeof node !== 'object') return false
    const key = path.at(-1)!
    if (Array.isArray(node)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index > node.length || index > 20000) throw new Error('Invalid compaction array index')
      if (patch.op === 'remove') node.splice(index, 1)
      else if (patch.op === 'add') node.splice(index, 0, project(patch.value, path))
      else if (patch.op === 'replace') node[index] = project(patch.value, path)
    } else if (patch.op === 'remove') delete node[key]
    else node[key] = project(patch.value, path)
    return true
  }
}
