import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentLamp, TeamReactor } from '../components/agent-visualizer/team/team-visuals'

it('team status animations do not change layout or SVG geometry on every frame', () => {
  const css = postcss.parse(readFileSync(new URL('../components/agent-visualizer/team/team.css', import.meta.url), 'utf8'))
  const geometry = /^(top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|margin(?:-.+)?|padding(?:-.+)?|stroke-width|r|cx|cy)$/
  const violations: string[] = []
  css.walkAtRules('keyframes', animation => {
    animation.walkDecls(declaration => {
      if (geometry.test(declaration.prop)) violations.push(`${animation.params}: ${declaration.prop}`)
    })
  })
  assert.deepEqual(violations, [], 'Status decoration must move using transforms/opacity rather than invalidating geometry')
})

it('reactor and status animations target HTML layers rather than SVG descendants', () => {
  const css = postcss.parse(readFileSync(new URL('../components/agent-visualizer/team/team.css', import.meta.url), 'utf8'))
  const animated = new Set<string>()
  css.walkRules(rule => {
    if (!rule.nodes.some(node => node.type === 'decl' && /^animation(?:-name)?$/.test(node.prop) && node.value !== 'none !important')) return
    for (const selector of rule.selectors) {
      const target = selector.trim().match(/\.([\w-]+)(?:::[\w-]+)?$/)?.[1]
      if (target && !selector.includes('::')) animated.add(target)
    }
  })
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(AgentLamp, { status: 'thinking' }),
    createElement(TeamReactor, { statuses: ['thinking', 'running'], active: 2, live: true })))
  let svgDepth = 0
  const violations: string[] = []
  for (const token of html.matchAll(/<\/?[\w-]+\b[^>]*>/g)) {
    const tag = token[0]
    if (tag.startsWith('</svg')) { svgDepth--; continue }
    if (tag.startsWith('<svg')) svgDepth++
    if (svgDepth && !tag.startsWith('</')) {
      for (const name of tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? []) {
        if (animated.has(name)) violations.push(name)
      }
    }
  }
  assert.deepEqual(violations, [], 'SVG transforms still invalidate SVG layout in Chromium; animate an enclosing HTML layer')
})
