'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { parseEnv } = require('node:util')

function resolveMobileConfig(env = process.env) {
  if (env.AGENT_FLOW_REMOTE_CONFIG) return env.AGENT_FLOW_REMOTE_CONFIG
  const candidate = path.join(env.CODEX_SENSITIVE_DIR || 'D:/sensitive', 'agent-flow-supabase.env')
  return fs.existsSync(candidate) ? candidate : undefined
}

function pairingURL(config) {
  if (config.AGENT_FLOW_REMOTE_ENABLED !== '1') throw new Error('Mobile sharing is disabled on this computer.')
  const key = config.AGENT_FLOW_PAIRING_KEY || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key, 'base64url').toString('base64url') !== key) {
    throw new Error('Mobile pairing is not configured. Complete mobile setup first.')
  }
  // Fragments are not included in the HTTP request to the static host.
  return `https://deotom.github.io/agent-flow/#pair=${key}`
}

async function createPairingQR(configFile) {
  if (!configFile) throw new Error('Mobile sharing is not configured on this computer.')
  let config
  try { config = parseEnv(fs.readFileSync(configFile, 'utf8')) }
  catch { throw new Error('Could not read the mobile configuration on this computer.') }
  const url = pairingURL(config)
  // Generate locally. Never send the pairing URL to an external QR service.
  const dataURL = await require('qrcode').toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: 'M' })
  return { dataURL }
}

module.exports = { resolveMobileConfig, pairingURL, createPairingQR }
