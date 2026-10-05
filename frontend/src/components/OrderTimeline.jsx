import React from 'react'
import { formatOrderDate, getOrderPresentation, getOrderTimeline } from '../utils/orderPresentation'

const OrderTimeline = ({ order, id }) => {
  const presentation = getOrderPresentation(order)
  if (presentation.group === 'Cancelled') return <div id={id} tabIndex={-1} className='mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300'><p className='font-semibold'>This order was cancelled.</p><p>The fulfillment workflow has ended.</p></div>
  if (!presentation.current) return <p id={id} tabIndex={-1} className='mt-5 text-xs text-slate-500 dark:text-slate-400'>Detailed progress is unavailable for this order status.</p>
  const steps = getOrderTimeline(order)
  const completed = presentation.group === 'Completed'
  const lineColor = completed ? 'bg-emerald-500' : 'bg-amber-400'
  const markerColor = completed ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-slate-950'

  return (
    <div id={id} tabIndex={-1} aria-label={'Order progress: ' + presentation.label} className='mt-6 rounded focus-visible:outline-amber-500'>
      <ol className='grid grid-cols-1 sm:grid-cols-7'>
        {steps.map((step, index) => {
          const date = formatOrderDate(step.date)
          return <li key={step.key} aria-current={step.current ? 'step' : undefined} className='relative flex min-w-0 gap-3 pb-4 last:pb-0 sm:block sm:pb-0 sm:pr-2'>
            {index < steps.length - 1 && <span aria-hidden='true' className={'absolute bottom-0 left-[7px] top-4 w-0.5 sm:left-2 sm:right-0 sm:top-[7px] sm:h-0.5 sm:w-auto ' + (step.reached && steps[index + 1].reached ? lineColor : 'bg-slate-200 dark:bg-slate-700')}/>}
            <span aria-hidden='true' className={'relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ' + (step.reached ? markerColor : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500')}>
              {step.reached && !step.current ? <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' className='h-2.5 w-2.5'><path d='m3 8 3 3 7-7'/></svg> : <span className='h-1 w-1 rounded-full bg-current'/>}
            </span>
            <div className='min-w-0 sm:mt-2'><p className={'text-[11px] leading-4 ' + (step.current ? 'font-semibold text-slate-900 dark:text-slate-100' : step.reached ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400')}>{step.label}</p><span className='sr-only'>{step.current ? ', current stage' : step.reached ? ', reached' : ', not reached'}</span>{step.reached && date && <p className='mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400'>{date}</p>}</div>
          </li>
        })}
      </ol>
    </div>
  )
}

export default OrderTimeline
