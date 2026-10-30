import { config } from './config.js'
import { createCipher, realtimeURL, joinMessage, broadcastMessage } from './protocol.mjs'

const $ = id => document.getElementById(id)
let socket, cipher, retry, heartbeat, joinTimeout, staleTimer
let generation = 0, active = false, attempt = 0, latest = null, lastSnapshot = 0, lastSentAt = 0, demoMode = false
const statusText = { working: 'ทำงาน', thinking: 'กำลังคิด', completed: 'เสร็จแล้ว', idle: 'พัก', 'needs-input': 'รอคุณ', error: 'ผิดพลาด' }
const eventText = { agent_spawn: 'เริ่มทำงาน', subagent_dispatch: 'มอบหมายงาน', agent_thinking: 'กำลังคิด', tool_call_start: 'ใช้เครื่องมือ', tool_call_end: 'เรียกเครื่องมือเสร็จ', agent_complete: 'ทำงานเสร็จ', subagent_return: 'ส่งงานกลับ', agent_idle: 'พักการทำงาน', permission_requested: 'รออนุญาต', input_requested: 'รอคำตอบ', input_resolved: 'ทำงานต่อ', error: 'พบข้อผิดพลาด' }
function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function connection(text, offline = false) {
  $('connection').textContent = text
  $('connection').classList.toggle('offline', offline)
}
function notice(text) { $('notice').textContent = text; $('notice').hidden = !text }
function showDashboard() { $('pair-panel').hidden = true; $('dashboard').hidden = false }
function clearTimers() { clearTimeout(retry); clearTimeout(joinTimeout); clearInterval(heartbeat); clearInterval(staleTimer) }
function stop() {
  active = false; generation++; clearTimers(); socket?.close(); socket = undefined
  cipher = undefined; latest = null; lastSnapshot = 0; lastSentAt = 0; demoMode = false
}
function freshness() {
  if (demoMode) return
  if (lastSnapshot) {
    const seconds = Math.max(0, Math.floor((Date.now() - lastSnapshot) / 1000))
    $('updated').textContent = `อัปเดตล่าสุด ${seconds < 2 ? 'เมื่อสักครู่' : `${seconds} วินาทีที่แล้ว`} · เข้ารหัสจากคอมถึงมือถือ`
    if (seconds > 35) {
      connection('ข้อมูลเก่า', true)
      notice('ยังไม่ได้รับสถานะใหม่ คอมอาจปิด พักเครื่อง หรือหลุดจากเครือข่าย ข้อมูลด้านล่างเป็นสถานะล่าสุดที่ได้รับ')
    }
  }
}
function render(snapshot) {
  latest = snapshot
  $('workspace').textContent = snapshot.workspace || 'Your workspace'
  const sessions = snapshot.sessions.slice(0, 12)
  const agents = sessions.flatMap(s => Array.isArray(s.agents) ? s.agents : [])
  $('working').textContent = agents.filter(a => ['working', 'thinking'].includes(a.status)).length
  $('needs').textContent = agents.filter(a => a.status === 'needs-input').length
  $('sessions-count').textContent = sessions.length
  const container = $('sessions'); container.replaceChildren()
  if (!sessions.length) container.append(el('div', 'empty', 'เชื่อมต่อกับคอมแล้ว ยังไม่มีเซสชันในโฟลเดอร์ที่เลือก เริ่มงาน Claude หรือ Codex บนคอมแล้วสถานะจะแสดงที่นี่'))
  for (const session of sessions) {
    const card = el('article', 'session-card'), head = el('div', 'session-head')
    head.append(el('h3', '', session.label || 'Session'), el('span', 'runtime', session.runtime || 'AGENT'))
    const list = el('div', 'agents')
    for (const agent of (session.agents || []).slice(0, 32)) {
      const node = el('div', `agent${agent.parent ? ' child' : ''}`); node.dataset.status = agent.status
      const content = el('div', 'agent-content')
      content.append(el('span', 'agent-name', agent.name))
      const detail = [agent.tool, agent.model, Number.isFinite(agent.tokens) ? `${new Intl.NumberFormat().format(agent.tokens)} tokens` : ''].filter(Boolean).join(' · ')
      content.append(el('span', 'agent-detail', detail || (agent.parent ? `↳ ${agent.parent}` : 'Main agent')))
      node.append(el('span', 'agent-dot', agent.parent ? '↳' : '✳'), content, el('span', 'agent-state', statusText[agent.status] || agent.status))
      list.append(node)
    }
    if (!list.children.length) list.append(el('p', 'agent-detail', 'รอกิจกรรมเอเจนต์…'))
    card.append(head, list, el('div', 'session-foot', session.status === 'completed' ? 'SESSION COMPLETED' : 'SESSION ACTIVE'))
    container.append(card)
  }
  const activity = $('activity'); activity.replaceChildren()
  const events = sessions.flatMap(s => s.recent || []).sort((a, b) => b.at - a.at).slice(0, 12)
  if (!events.length) activity.append(el('li', '', 'ยังไม่มีกิจกรรมล่าสุด'))
  for (const event of events) {
    const row = el('li'), date = new Date(event.at)
    row.append(el('span', 'activity-dot'), el('span', 'activity-text', `${event.agent} · ${eventText[event.type] || event.type}${event.tool ? ` / ${event.tool}` : ''}`), el('time', '', Number.isFinite(date.getTime()) ? date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''))
    activity.append(row)
  }
}
async function requestSnapshot() {
  const current = socket
  if (!cipher || current?.readyState !== WebSocket.OPEN) return
  const envelope = await cipher.seal({ type: 'request', sentAt: Date.now() })
  if (socket === current && current.readyState === WebSocket.OPEN) current.send(JSON.stringify(broadcastMessage(cipher.topic, envelope)))
}
function connect() {
  if (!active || demoMode) return
  const currentGeneration = ++generation
  clearTimers()
  socket?.close()
  const current = new WebSocket(realtimeURL(config.url, config.publishableKey)); socket = current
  let lastFrame = Date.now()
  connection('กำลังเชื่อมต่อ', true)
  joinTimeout = setTimeout(() => current.close(), 15_000)
  current.addEventListener('open', () => current.send(JSON.stringify(joinMessage(cipher.topic))))
  current.addEventListener('message', async ({ data }) => {
    if (!active || generation !== currentGeneration) return
    lastFrame = Date.now()
    let message
    try { message = JSON.parse(data) } catch { return }
    if (message.event === 'phx_reply' && message.ref === '1') {
      if (message.payload?.status !== 'ok') { notice('เชื่อมต่อ Supabase ไม่สำเร็จ กรุณาตรวจการตั้งค่าโปรเจกต์'); current.close(); return }
      clearTimeout(joinTimeout); attempt = 0
      connection('เชื่อมต่อแล้ว')
      notice('รอข้อมูลจากคอม ตรวจว่าเปิด Agent Flow ในโหมดแชร์มือถือและใช้รหัสจับคู่เดียวกัน')
      try { await requestSnapshot() } catch { current.close() }
    }
    if (message.event !== 'broadcast' || message.payload?.event !== 'encrypted') return
    try {
      const snapshot = await cipher.open(message.payload.payload)
      if (!active || generation !== currentGeneration || snapshot.type !== 'snapshot' ||
          !Number.isFinite(snapshot.sentAt) || Math.abs(Date.now() - snapshot.sentAt) > 60_000 ||
          snapshot.sentAt <= lastSentAt || !Array.isArray(snapshot.sessions)) return
      lastSentAt = snapshot.sentAt; lastSnapshot = snapshot.sentAt
      render(snapshot); notice(''); connection('Live'); freshness()
    } catch { /* Invalid ciphertext is never rendered. */ }
  })
  current.addEventListener('error', () => current.close())
  current.addEventListener('close', () => {
    if (!active || generation !== currentGeneration) return
    clearTimeout(joinTimeout); clearInterval(heartbeat)
    connection('เชื่อมต่อใหม่…', true)
    if (!latest) notice('ยังเชื่อมต่อไม่ได้ กำลังลองใหม่อัตโนมัติ ตรวจอินเทอร์เน็ตและรหัสจับคู่')
    retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)))
  })
  heartbeat = setInterval(() => {
    if (Date.now() - lastFrame > 45_000) { current.close(); return }
    if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', ref: 'heartbeat', payload: {} }))
  }, 15_000)
  staleTimer = setInterval(freshness, 1000)
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault(); $('pair-error').textContent = ''
  stop()
  try {
    cipher = await createCipher($('pair-key').value.trim())
    $('pair-key').value = ''; active = true; showDashboard(); render({ workspace: 'Your workspace', sessions: [] })
    $('updated').textContent = 'รอข้อมูลจากคอม…'; $('live-caption').textContent = 'สถานะจากคอมของคุณ'; connect()
  } catch { $('pair-error').textContent = 'รหัสจับคู่ไม่ถูกต้อง กรุณาวางรหัส 43 ตัวอักษรจากคอม' }
})
$('show-key').addEventListener('click', () => {
  const input = $('pair-key'); input.type = input.type === 'password' ? 'text' : 'password'
  $('show-key').textContent = input.type === 'password' ? 'แสดง' : 'ซ่อน'
})
$('disconnect').addEventListener('click', () => { stop(); $('pair-panel').hidden = false; $('dashboard').hidden = true; $('pair-key').value = '' })
document.addEventListener('visibilitychange', () => { if (!document.hidden && active) connect() })
window.addEventListener('pageshow', event => { if (event.persisted && active) connect() })
window.addEventListener('pagehide', () => { clearTimers(); generation++; socket?.close() })
$('demo').addEventListener('click', () => {
  stop(); demoMode = true; showDashboard(); connection('ตัวอย่าง'); notice('ข้อมูลจำลองสำหรับดูหน้าจอ ไม่ใช่สถานะงานจริง'); $('updated').textContent = 'DEMO WORKSPACE · ข้อมูลตัวอย่าง'; $('live-caption').textContent = 'ข้อมูลจำลอง'
  render({ workspace: 'A good day to build.', sessions: [
    { id: 'demo-1', label: 'Session a3f82b91', runtime: 'CODEX', status: 'active', agents: [
      { name: 'Orchestrator', status: 'thinking', model: 'Codex', tokens: 24180 },
      { name: 'Interface', parent: 'Orchestrator', status: 'working', tool: 'apply_patch' },
      { name: 'Verification', parent: 'Orchestrator', status: 'completed' },
    ], recent: [{ type: 'tool_call_start', agent: 'Interface', tool: 'apply_patch', at: Date.now() }, { type: 'agent_complete', agent: 'Verification', at: Date.now() - 60_000 }] },
    { id: 'demo-2', label: 'Session b1e29d04', runtime: 'CLAUDE', status: 'active', agents: [{ name: 'Orchestrator', status: 'needs-input', model: 'Claude' }], recent: [{ type: 'input_requested', agent: 'Orchestrator', at: Date.now() - 20_000 }] },
  ] })
})
