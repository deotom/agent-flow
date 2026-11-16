export const OFFICE_DISCOVERY_STORAGE = 'agent-flow-office-discovery-v1'
export const OFFICE_DISCOVERY_DURATION = 12_000

export function officeDiscoverySeen(raw: string | null): boolean {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    return typeof value === 'object' && value !== null &&
      'version' in value && value.version === 1 && 'seen' in value && value.seen === true
  } catch { return false }
}

/** Consume only visible time, using a monotonic clock supplied by the caller. */
export class OfficeDiscoveryClock {
  remaining = OFFICE_DISCOVERY_DURATION
  private started: number | null = null

  left(now: number): number {
    return Math.max(0, this.remaining - (this.started === null ? 0 : Math.max(0, now - this.started)))
  }

  resume(now: number): void {
    if (this.started === null) this.started = now
  }

  pause(now: number): void {
    this.remaining = this.left(now)
    this.started = null
  }

  reset(): void {
    this.remaining = OFFICE_DISCOVERY_DURATION
    this.started = null
  }
}
