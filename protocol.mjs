// Shared by the local publisher and mobile viewer. Pairing keys never leave the device.
const encoder = new TextEncoder()
const decoder = new TextDecoder()
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function decode(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))
}
export function generatePairingKey(cryptoApi = globalThis.crypto) {
  return encode(cryptoApi.getRandomValues(new Uint8Array(32)))
}
export async function createCipher(pairingKey, cryptoApi = globalThis.crypto) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(pairingKey)) throw new Error('Invalid pairing key')
  const raw = decode(pairingKey)
  if (raw.length !== 32 || encode(raw) !== pairingKey) throw new Error('Invalid pairing key')
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', raw))
  const topic = `realtime:agent-flow-${encode(digest)}`
  const key = await cryptoApi.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  const additionalData = encoder.encode(topic)
  return {
    topic,
    async seal(value) {
      const iv = cryptoApi.getRandomValues(new Uint8Array(12))
      const encrypted = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, encoder.encode(JSON.stringify(value)))
      return { v: 1, iv: encode(iv), data: encode(new Uint8Array(encrypted)) }
    },
    async open(envelope) {
      if (envelope?.v !== 1 || typeof envelope.iv !== 'string' || envelope.iv.length !== 16 ||
          typeof envelope.data !== 'string' || envelope.data.length > 180_000) throw new Error('Invalid encrypted message')
      const plain = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData }, key, decode(envelope.data))
      return JSON.parse(decoder.decode(plain))
    },
  }
}

export function realtimeURL(projectUrl, publishableKey) {
  const url = new URL(projectUrl)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Expected Supabase HTTPS project URL')
  url.protocol = 'wss:'
  url.pathname = '/realtime/v1/websocket'
  url.search = ''
  url.searchParams.set('apikey', publishableKey)
  url.searchParams.set('vsn', '1.0.0')
  return url.href
}
export function joinMessage(topic) {
  return { topic, event: 'phx_join', ref: '1', join_ref: '1', payload: {
    config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false },
  } }
}
export function broadcastMessage(topic, payload) {
  return { topic, event: 'broadcast', ref: '2', join_ref: '1', payload: { type: 'broadcast', event: 'encrypted', payload } }
}
