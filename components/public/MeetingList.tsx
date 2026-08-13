import type { MeetingWithRelations, Municipality } from '@/lib/supabase/database.types'
import { MeetingCard } from './MeetingCard'

export function MeetingList({
  id,
  heading,
  description,
  meetings,
  municipality,
  emptyMessage,
}: {
  id: string
  heading: string
  description?: string
  meetings: MeetingWithRelations[]
  municipality: Municipality
  emptyMessage: string
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10 first:mt-0">
      <h2 id={`${id}-heading`} className="text-2xl font-semibold">
        {heading}
      </h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}

      {meetings.length === 0 ? (
        <p className="mt-4 rounded border border-dashed border-rule-strong bg-paper-sunk px-4 py-6 text-ink-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-4 border-b border-rule">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} municipality={municipality} />
          ))}
        </div>
      )}
    </section>
  )
}
