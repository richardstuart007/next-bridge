function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className='text-base font-semibold text-gray-900 mb-2'>{title}</h3>
      {children}
    </div>
  )
}

export const HELP_AUDIT_AVERAGES = (
  <Section title='Audit — Averages & Partnerships'>
    <p className='text-sm text-gray-600 mb-2'>
      Checks that player session counts, averages, and partnership stats are consistent with the result data.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li><strong>Incorrect session count</strong> — stored count differs from actual distinct sessions in results; re-run Recalculate Averages</li>
      <li><strong>Avg% = 0 with sessions</strong> — average calculation failed for these players</li>
      <li><strong>Partnerships not recalculated</strong> — partnerships exist with no sessions; re-run Recalculate Partnerships</li>
    </ul>
  </Section>
)

export const HELP_RECALC_DATE_SEQ = (
  <Section title='Recalculate Date Seq'>
    <p className='text-sm text-gray-600 mb-2'>
      Assigns a sequence number (1, 2, 3…) to sessions that share the same date, in chronological
      import order.
    </p>
    <ul className='text-sm text-gray-700 space-y-1 list-disc list-inside'>
      <li>Updates <code className='bg-gray-100 px-1 rounded'>se_date_seq</code> on <code className='bg-gray-100 px-1 rounded'>tre_sessions</code></li>
      <li>Needed when a club runs two sessions on the same day (e.g. morning and afternoon)</li>
      <li>The Seq column in the player history table uses this value</li>
    </ul>
  </Section>
)
