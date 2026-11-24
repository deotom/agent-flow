/**
 * Ask the Agent Flow desktop app to act on T3 through T3's own CLI (never its database).
 * The orb window has a preload API; the main window's page lives in the shell's iframe and asks the shell.
 * In a browser or VS Code there is no desktop app, so prompting is unavailable.
 */
export type DesktopAction = 't3-send' | 't3-start' | 'open-project' | 'notify'
export interface PromptResult { ok: true; threadId?: string }
export interface DesktopNotificationPayload {
  title: string
  body: string
  tag?: string
  silent?: boolean
}

interface OrbPromptApi {
  t3Send(payload: unknown): Promise<unknown>
  t3Start(payload: unknown): Promise<unknown>
  openProject(payload: unknown): Promise<unknown>
  notify?(payload: unknown): Promise<unknown>
}
const orbApi = (): OrbPromptApi | undefined => (window as unknown as { agentFlowOrb?: Partial<OrbPromptApi> }).agentFlowOrb?.t3Send
  ? (window as unknown as { agentFlowOrb: OrbPromptApi }).agentFlowOrb : undefined
const inDesktopFrame = () => window.parent !== window && new URLSearchParams(window.location.search).get('desktop') === '1'

export function canSendPrompts(): boolean {
  return typeof window !== 'undefined' && (Boolean(orbApi()) || inDesktopFrame())
}

export function canNotifyDesktop(): boolean {
  return typeof window !== 'undefined' && (Boolean(orbApi()?.notify) || inDesktopFrame())
}

let nextId = 0
/** Electron prefixes invoke errors with its own wording; keep only the app's message. */
export const cleanError = (message: string) => message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')

export function desktopRequest(action: DesktopAction, payload: unknown, timeoutMs = 90_000): Promise<unknown> {
  const orb = orbApi()
  if (orb) {
    const call = action === 't3-send'
      ? orb.t3Send(payload)
      : action === 't3-start'
        ? orb.t3Start(payload)
        : action === 'notify'
          ? (orb.notify ? orb.notify(payload) : Promise.resolve({ shown: false }))
          : orb.openProject(payload)
    return call.catch((error: unknown) => { throw new Error(cleanError(error instanceof Error ? error.message : String(error))) })
  }
  if (!inDesktopFrame()) return Promise.reject(new Error('Sending prompts needs the Agent Flow desktop app.'))
  const id = `req-${Date.now().toString(36)}-${++nextId}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('The desktop app did not answer.')), timeoutMs)
    function finish(error: Error | null, result?: unknown) {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (error) reject(error)
      else resolve(result)
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; id?: string; ok?: boolean; result?: unknown; error?: unknown } | null
      if (event.source !== window.parent || data?.type !== 'agent-flow:desktop-response' || data.id !== id) return
      if (data.ok) finish(null, data.result)
      else finish(new Error(typeof data.error === 'string' && data.error ? cleanError(data.error) : 'The desktop app could not do that.'))
    }
    window.addEventListener('message', onMessage)
    // The shell checks that this came from its own iframe at the relay origin before acting.
    window.parent.postMessage({ type: 'agent-flow:desktop-request', id, action, payload }, '*')
  })
}

export async function notifyDesktop(payload: DesktopNotificationPayload): Promise<{ shown: boolean }> {
  if (!canNotifyDesktop()) return { shown: false }
  try {
    const result = await desktopRequest('notify', payload, 5000) as { shown?: unknown } | null
    return { shown: result?.shown === true }
  } catch {
    return { shown: false }
  }
}

/** T3 thread id from an Agent Flow session id ("t3:<uuid>"). */
export const threadIdOf = (sessionId: string) => sessionId.replace(/^t3:/, '')
