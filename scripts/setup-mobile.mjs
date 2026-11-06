// Explicit local setup; secrets remain outside the repository.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { webcrypto } from 'node:crypto'
import { generatePairingKey } from '../mobile/protocol.mjs'

const file = process.argv[2]
if (!file || !existsSync(file)) throw new Error('Pass the existing local Supabase env file path.')
let content = readFileSync(file, 'utf8')
const config = parseEnv(content)
if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) throw new Error('Supabase URL and publishable key are required.')
if (!config.AGENT_FLOW_PAIRING_KEY) content += `\n# Keep this 256-bit device pairing key private.\nAGENT_FLOW_PAIRING_KEY=${generatePairingKey(webcrypto)}\n`
if (config.AGENT_FLOW_REMOTE_ENABLED === undefined) content += 'AGENT_FLOW_REMOTE_ENABLED=1\n'
writeFileSync(file, content, { mode: 0o600 })
console.log('Mobile sharing configuration prepared. Pairing key saved locally; not printed.')
