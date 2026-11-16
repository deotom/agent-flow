import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficeDiscoveryClock, officeDiscoverySeen } from '../lib/office-discovery'
import { OfficeDiscoveryTip } from '../components/agent-visualizer/office/office-discovery'

test('only the current explicit saved preference suppresses first-visit help', () => {
  for (const value of [null, '', 'true', '{}', '{"version":0,"seen":true}', '{"version":1,"seen":false}', 'broken']) {
    assert.equal(officeDiscoverySeen(value), false)
  }
  assert.equal(officeDiscoverySeen('{"version":1,"seen":true}'), true)
})

test('discovery consumes twelve visible seconds and never catches up hidden time', () => {
  const clock = new OfficeDiscoveryClock()
  clock.resume(100)
  clock.pause(4_100)
  assert.equal(clock.remaining, 8_000)
  clock.resume(100_000)
  assert.equal(clock.left(107_999), 1)
  assert.equal(clock.left(108_000), 0)
})

test('a never-visible clock waits, repeated visibility does not reset it, and replay resets it', () => {
  const clock = new OfficeDiscoveryClock()
  assert.equal(clock.left(100_000), 12_000)
  clock.resume(100_000)
  clock.resume(104_000)
  assert.equal(clock.left(105_000), 7_000)
  clock.pause(105_000)
  clock.reset()
  clock.resume(200_000)
  assert.equal(clock.left(200_000), 12_000)
})

test('tip is absent when closed and provides nonmodal Thai instructions when open', () => {
  assert.equal(renderToStaticMarkup(createElement(OfficeDiscoveryTip, { open: false, onDismiss() {} })), '')
  const html = renderToStaticMarkup(createElement(OfficeDiscoveryTip, { open: true, onDismiss() {} }))
  assert.match(html, /role="note"/)
  for (const text of ['ชื่อเต็ม', 'โต๊ะงานหรือบอร์ด', 'ประตู', 'ห้องพัก', 'ปิดคำแนะนำ Office']) assert.ok(html.includes(text))
  assert.doesNotMatch(html, /aria-live|aria-modal|autofocus|role="dialog"/i)
})
