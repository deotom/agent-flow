import { COLORS } from '@/lib/colors'

export function AgentScopeSwitch({ showAll, activeCount, totalCount, onChange }: {
  showAll: boolean; activeCount: number; totalCount: number; onChange: (all: boolean) => void
}) {
  return <div role="group" aria-label="Agent visibility" className="inline-flex shrink-0 rounded-md overflow-hidden text-[10px]" style={{ border: `1px solid ${COLORS.glassBorder}` }}>
    {([[false, 'กำลังทำงาน', activeCount], [true, 'ทั้ง session', totalCount]] as const).map(([all, label, count]) =>
      <button key={String(all)} type="button" aria-pressed={showAll === all} onClick={() => onChange(all)}
        className="px-2 py-1 whitespace-nowrap" style={{ color: showAll === all ? COLORS.holoBright : COLORS.textMuted,
          background: showAll === all ? COLORS.toggleActive : COLORS.toggleInactive }}>
        {label} {count}
      </button>)}
  </div>
}
