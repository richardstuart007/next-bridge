'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyConfirmDialog, type ConfirmDialogInt } from 'nextjs-shared/MyConfirmDialog'

interface Staging { ts0: number; ts1: number; ts2: number }

interface Props {
  staging: Staging | null
  busy: boolean
  onTruncate: () => void
}

const CONFIRM_DIALOG_INITIAL: ConfirmDialogInt = {
  isOpen: false,
  title: 'Truncate staging tables?',
  subTitle: 'This immediately wipes ts0, ts1, and ts2 — this cannot be undone.',
  onConfirm: () => {},
}

export default function StagingBar({ staging, busy, onTruncate }: Props) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogInt>(CONFIRM_DIALOG_INITIAL)
  const hasData = staging && (staging.ts0 > 0 || staging.ts1 > 0 || staging.ts2 > 0)

  function handleTruncateClick() {
    setConfirmDialog({
      ...CONFIRM_DIALOG_INITIAL,
      isOpen: true,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        onTruncate()
      },
    })
  }

  return (
    <section className='rounded border border-red-200 bg-red-50 p-3 flex items-center gap-4 flex-wrap'>
      <span className='text-xs font-mono text-gray-600'>
        ts0: {staging?.ts0 ?? '…'} · ts1: {staging?.ts1 ?? '…'} · ts2: {staging?.ts2 ?? '…'}
      </span>
      {hasData
        ? (
          <MyButton onClick={handleTruncateClick} disabled={busy}
            overrideClass='rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50'>
            {busy ? 'Truncating…' : 'Truncate ts0 / ts1 / ts2'}
          </MyButton>
        ) : (
          <span className='text-xs text-green-700 font-medium'>All staging tables empty — ready</span>
        )
      }
      <MyConfirmDialog confirmDialog={confirmDialog} setConfirmDialog={setConfirmDialog} />
    </section>
  )
}
