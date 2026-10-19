import type { Agent } from '@/lib/agent-types'

export interface AgentHint { agentId: string; x: number; y: number; since: number }
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const wrapCache = new WeakMap<CanvasRenderingContext2D, { key: string; lines: string[] }>()

export function updateAgentHint(current: AgentHint | null, agentId: string | undefined, x: number, y: number, now: number): AgentHint | null {
  return agentId ? { agentId, x, y, since: current?.agentId === agentId ? current.since : now } : null
}

/** Screen-space, static HUD tooltip. It uses the existing draw loop, after bloom. */
export function drawAgentTooltip(ctx: CanvasRenderingContext2D, hint: AgentHint | null,
  agents: Map<string, Agent>, now: number, width: number, height: number, topInset: number) {
  if (!hint || now - hint.since < 400) return
  const agent = agents.get(hint.agentId)
  if (!agent || agent.opacity <= 0.5) return
  const padding = 12, margin = 8
  const top = Math.min(topInset + margin, Math.max(margin, height - 100))
  const bottom = height - 60
  if (width < 120 || bottom - top < 80) return
  const boxWidth = Math.min(320, width - margin * 2)
  ctx.save()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.font = '500 12.5px "Segoe UI", sans-serif'
  let lines: string[] = []
  let line = ''
  const maxLines = Math.max(1, Math.floor((bottom - top - 66) / 18))
  const key = JSON.stringify([agent.name, boxWidth, maxLines])
  const cached = wrapCache.get(ctx)
  if (cached?.key === key) lines = cached.lines
  else {
    for (const { segment } of segmenter.segment(agent.name.replace(/\s+/g, ' ').trim())) {
      if (ctx.measureText(line + segment).width > boxWidth - padding * 2 && line) {
        lines.push(line); line = ''
        if (lines.length >= maxLines) {
          const last = [...segmenter.segment(lines.at(-1)!)].map(part => part.segment)
          while (last.length && ctx.measureText(last.join('') + '…').width > boxWidth - padding * 2) last.pop()
          lines[lines.length - 1] = last.join('') + '…'
          break
        }
      }
      line += segment
    }
    if (line) lines.push(line)
    wrapCache.set(ctx, { key, lines })
  }
  const boxHeight = padding * 2 + lines.length * 18 + (agent.tokensMax > 0 ? 34 : 0)
  const x = Math.max(margin, Math.min(width - boxWidth - margin, hint.x + 14))
  const below = hint.y + 18
  const y = Math.max(top, Math.min(bottom - boxHeight, below + boxHeight <= bottom ? below : hint.y - boxHeight - 12))
  ctx.fillStyle = '#081725'
  ctx.strokeStyle = '#6bcfff80'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(x, y, boxWidth, boxHeight, 4); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#bceaff'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  for (let index = 0; index < lines.length; index++) ctx.fillText(lines[index], x + padding, y + padding + index * 18)
  if (agent.tokensMax > 0) {
    ctx.font = '10.5px "Segoe UI", sans-serif'
    ctx.fillStyle = '#91a9bd'
    const row = y + padding + lines.length * 18 + 4
    ctx.fillText(`${agent.tokensUsed.toLocaleString()} / ${agent.tokensMax.toLocaleString()} tokens used`, x + padding, row, boxWidth - padding * 2)
    const remaining = Math.round(Math.max(0, Math.min(1, 1 - agent.tokensUsed / agent.tokensMax)) * 100)
    ctx.fillText(`CTX เหลือ ${remaining}%`, x + padding, row + 15, boxWidth - padding * 2)
  }
  ctx.restore()
}
