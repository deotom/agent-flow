import * as fs from 'fs'
import * as path from 'path'
import { AgentEvent } from './protocol'
import { readNewFileLines } from './fs-utils'
import { TypedEventEmitter } from './typed-event-emitter'
import { POLL_FALLBACK_MS } from './constants'

/**
 * Watches a JSONL file for agent events.
 * Each line is a JSON object matching the AgentEvent shape.
 * New lines appended to the file are emitted as events.
 */
export class JsonlEventSource {
  private watcher: fs.FSWatcher | null = null
  private fileSize = 0
  private fileTail = ''
  private pollTimer: NodeJS.Timeout | null = null
  private readonly _onEvent = new TypedEventEmitter<AgentEvent>()
  private readonly _onStatus = new TypedEventEmitter<'connected' | 'disconnected'>()

  readonly onEvent = this._onEvent.event
  readonly onStatus = this._onStatus.event

  constructor(private filePath: string) {}

  start(): void {
    if (!fs.existsSync(this.filePath)) {
      // Create the file if it doesn't exist
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, '')
    }

    // Read existing content
    this.replay()

    // Watch for changes
    this.watcher = fs.watch(this.filePath, () => {
      this.readNewLines()
    })

    this._onStatus.fire('connected')
    this.pollTimer = setInterval(() => this.readNewLines(), POLL_FALLBACK_MS)
  }

  replay(): void {
    const content = readNewFileLines(this.filePath, 0)
    if (!content) return
    this.fileSize = content.newSize
    this.fileTail = content.tail
    for (const line of content.lines) {
      const event = this.parseLine(line)
      if (event) {
        this._onEvent.fire({ ...event, historical: true })
      }
    }
  }

  private readNewLines(): void {
    const result = readNewFileLines(this.filePath, this.fileSize, this.fileTail)
    if (!result) return
    this.fileSize = result.newSize
    this.fileTail = result.tail
    for (const line of result.lines) {
      const event = this.parseLine(line)
      if (event) {
        this._onEvent.fire(event)
      }
    }
  }

  private parseLine(line: string): AgentEvent | null {
    try {
      const parsed = JSON.parse(line.trim())
      if (parsed && typeof parsed.type === 'string' && typeof parsed.time === 'number' && Number.isFinite(parsed.time)
        && parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)) {
        return parsed as AgentEvent
      }
      return null
    } catch {
      return null
    }
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.watcher?.close()
    this.watcher = null
    this._onEvent.dispose()
    this._onStatus.dispose()
  }
}
