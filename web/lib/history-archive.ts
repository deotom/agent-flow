import type { SimulationEvent, ToolCallNode } from './agent-types'
import type { ConversationMessage, Delegation } from '@/hooks/simulation/types'

type Row = { key: IDBValidKey[]; value: unknown }
type Write = { store: string; row: Row; resolve: () => void; reject: (error: unknown) => void }
export interface MessageRow extends ConversationMessage { agentId: string; agentName: string }
export interface HistoryPage<T> { items: T[]; cursor?: IDBValidKey[]; more: boolean }

/** Rebuildable local disk cache; original Codex/Claude transcript files remain authoritative. */
export class HistoryArchive {
  private db?: Promise<IDBDatabase>
  private queue: Write[] = []
  private timer?: ReturnType<typeof setTimeout>
  private writes = new Set<Promise<void>>()
  readonly namespace = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  error: string | null = null
  private listeners = new Set<() => void>()
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private open(): Promise<IDBDatabase> {
    return this.db ??= new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Local history storage is unavailable')); return }
      const request = indexedDB.open('agent-flow-history-v1', 2)
      request.onupgradeneeded = () => {
        for (const name of ['events', 'messages', 'tools', 'tasks', 'details']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' })
      }
      request.onsuccess = () => {
        const db = request.result
        resolve(db)
        // Clean a bounded number of expired cache keys, without reading their large values.
        const cutoff = `${Date.now() - 86400000}-\uffff`
        for (const store of ['events', 'messages', 'tools', 'tasks', 'details']) {
          const tx = db.transaction(store, 'readwrite')
          const keys = tx.objectStore(store).openKeyCursor(IDBKeyRange.upperBound([cutoff, []]))
          let deleted = 0
          keys.onsuccess = () => {
            const cursor = keys.result
            if (!cursor || deleted++ >= 1000) return
            tx.objectStore(store).delete(cursor.primaryKey)
            cursor.continue()
          }
        }
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Local history storage is blocked'))
    })
  }
  private put(store: string, key: IDBValidKey[], value: unknown): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.queue.push({ store, row: { key: [this.namespace, ...key], value }, resolve, reject })
      this.timer ??= setTimeout(() => { this.timer = undefined; void this.flushBatch() }, 0)
    })
    this.writes.add(promise)
    void promise.then(() => this.writes.delete(promise), error => { this.writes.delete(promise); this.error = String(error) })
    return promise
  }
  private async flushBatch() {
    const batch = this.queue.splice(0)
    if (!batch.length) return
    try {
      const db = await this.open()
      const tx = db.transaction([...new Set(batch.map(item => item.store))], 'readwrite')
      tx.oncomplete = () => {
        batch.forEach(item => item.resolve())
        if (batch.some(item => item.store !== 'events')) for (const listener of this.listeners) listener()
      }
      tx.onerror = tx.onabort = () => batch.forEach(item => item.reject(tx.error ?? new Error('History write failed')))
      for (const item of batch) tx.objectStore(item.store).put(item.row)
    } catch (error) { batch.forEach(item => item.reject(error)) }
  }
  async settle(): Promise<void> { await Promise.all([...this.writes]) }
  saveEvent(session: string, event: SimulationEvent) { return this.put('events', [session, event.sequence!], event) }
  async saveMessage(session: string, message: MessageRow) {
    const key = [session, message.sourceSequence!, message.id]
    if (message.inputData) await this.put('details', key, message)
    return this.put('messages', key, { ...message, inputData: undefined, hasDetails: !!message.inputData })
  }
  getMessageDetail(session: string, message: ConversationMessage) { return this.get<MessageRow>('details', [session, message.sourceSequence!, message.id]) }
  async saveTool(session: string, tool: ToolCallNode) {
    const previous = tool.inputsArchived ? await this.getTool(session, tool.id) : undefined
    return this.put('tools', [session, tool.id], previous ? { ...tool, args: previous.args, inputData: previous.inputData,
      result: tool.archived ? previous.result : tool.result } : tool)
  }
  async saveTask(session: string, task: Delegation) {
    const previous = await this.get<Delegation>('tasks', [session, task.startTime, task.id])
    return this.put('tasks', [session, task.startTime, task.id], previous ? { ...task, task: task.taskArchived ? previous.task : task.task,
      summary: task.archived ? previous.summary : task.summary } : task)
  }
  async page<T>(store: string, session: string, options: { cursor?: IDBValidKey[]; limit?: number; forward?: boolean; match?: (value: T) => boolean } = {}): Promise<HistoryPage<T>> {
    const db = await this.open()
    const lower: IDBValidKey[] = [this.namespace, session]
    const upper: IDBValidKey[] = [this.namespace, session, []]
    const range = options.forward
      ? IDBKeyRange.bound(options.cursor ?? lower, upper, !!options.cursor)
      : IDBKeyRange.bound(lower, options.cursor ?? upper, false, !!options.cursor)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const request = tx.objectStore(store).openCursor(range, options.forward ? 'next' : 'prev')
      const items: T[] = []
      let last: IDBValidKey[] | undefined
      request.onerror = () => reject(request.error)
      tx.onabort = () => reject(tx.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve({ items, cursor: last, more: false }); return }
        const row = cursor.value as Row
        if (!options.match || options.match(row.value as T)) {
          if (items.length >= (options.limit ?? 100)) { resolve({ items, cursor: last, more: true }); return }
          items.push(row.value as T)
          last = row.key
        }
        cursor.continue()
      }
    })
  }
  async getTool(session: string, id: string): Promise<ToolCallNode | undefined> {
    return this.get<ToolCallNode>('tools', [session, id])
  }
  private async get<T>(store: string, key: IDBValidKey[]): Promise<T | undefined> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get([this.namespace, ...key])
      request.onsuccess = () => resolve(request.result?.value)
      request.onerror = () => reject(request.error)
    })
  }
}
export const historyArchive = new HistoryArchive()

export function estimateBytes(value: unknown): number { return JSON.stringify(value).length * 2 }
