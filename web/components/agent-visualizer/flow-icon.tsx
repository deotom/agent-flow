import type { CSSProperties } from 'react'

const paths = {
  lock: 'M5 7V5a3 3 0 016 0v2 M4 7h8v7H4z M8 10v1',
  unlock: 'M5 7V5a3 3 0 015-2 M4 7h8v7H4z M8 10v1',
  settings: 'M6 2h4l.5 2 1.7 1 2-.5 2 3-1.5 1.5v2L16 12l-2 3-2-.5-1.7 1L10 18H6l-.5-2.5-1.7-1-2 .5-2-3 1.5-1.5v-2L0 7l2-3 2 .5 1.7-1L6 2z',
  info: 'M8 7v5 M8 4v.2',
  fit: 'M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4 M6 8h4 M8 6v4',
  expand: 'M9 2h5v5 M14 2L8 8 M6 3H2v11h11v-4',
  close: 'M4 4l8 8 M12 4l-8 8',
  chevron: 'M4 6l4 4 4-4',
  tasks: 'M4 2h8v12H4z M6 5h4 M6 8h4 M6 11h2',
  files: 'M2 4h5l2 2h5v8H2z',
  chat: 'M2 3h12v8H7l-4 3v-3H2z',
  cost: 'M11 4H6a2 2 0 000 4h4a2 2 0 010 4H4 M8 1v14',
  timeline: 'M2 2v12h12 M5 4h5 M7 7h6 M5 10h3',
} as const

export function FlowIcon({ name, size = 16, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
    {name === 'settings' ? <><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3 3l1.5 1.5 M11.5 11.5L13 13 M3 13l1.5-1.5 M11.5 4.5L13 3" /></> : <path d={paths[name]} />}
    {name === 'info' && <circle cx="8" cy="8" r="6" />}
  </svg>
}
