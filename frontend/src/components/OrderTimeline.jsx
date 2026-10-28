import { Check } from 'lucide-react'
import { formatOrderDate, getOrderPresentation, getOrderTimeline } from '../utils/orderPresentation'

const timelineClassName =
  'text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'
const timelineStepClassName = [
  'relative flex min-w-0 gap-3.5 pb-6 last:pb-0',
  'min-[1180px]:block min-[1180px]:pb-0 min-[1180px]:pr-3',
].join(' ')
const timelineLineClassName = [
  'absolute bottom-0 left-2 top-4 w-0.5',
  'min-[1180px]:bottom-auto min-[1180px]:left-[18px] min-[1180px]:right-0 min-[1180px]:top-2',
  'min-[1180px]:h-0.5 min-[1180px]:w-auto',
].join(' ')
const timelineMarkerClassName =
  'relative z-[1] flex h-[18px] w-[18px] flex-[0_0_18px] items-center justify-center rounded-full'

const getStepStatus = step => {
  if (step.current) return ', current stage'
  if (step.reached) return ', reached'
  return ', not reached'
}

const OrderTimeline = ({ order, id }) => {
  const presentation = getOrderPresentation(order)
  if (presentation.group === 'Cancelled') {
    return (
      <div id={id} className={timelineClassName}>
        <p>This order was cancelled.</p>
        <p>The fulfillment workflow has ended.</p>
      </div>
    )
  }
  if (!presentation.current) {
    return <p id={id} className={timelineClassName}>Detailed progress is unavailable for this order status.</p>
  }

  const steps = getOrderTimeline(order)
  const completed = presentation.group === 'Completed'

  return (
    <div id={id} aria-label={'Order progress: ' + presentation.label} className={timelineClassName}>
      <ol className='grid grid-cols-[minmax(0,1fr)] min-[1180px]:grid-cols-7'>
        {steps.map((step, index) => {
          const date = formatOrderDate(step.date)
          const nextStepReached = steps[index + 1]?.reached
          const lineReached = step.reached && nextStepReached
          const reachedColor = completed
            ? 'bg-[var(--pamo-color-success)]'
            : 'bg-[var(--pamo-color-brand-yellow)]'
          const lineColor = lineReached
            ? reachedColor
            : 'bg-[var(--pamo-color-border-input)]'
          const markerColor = step.reached
            ? `${reachedColor} text-slate-950`
            : 'bg-[var(--pamo-color-border-input)] text-[color:var(--pamo-color-text-secondary)]'
          const labelClass = step.current
            ? 'font-semibold leading-[18px] text-[color:var(--pamo-color-text-primary)]'
            : 'leading-[18px]'
          const showCheck = step.reached && !step.current

          return (
            <li key={step.key} aria-current={step.current ? 'step' : undefined} className={timelineStepClassName}>
              {index < steps.length - 1 && <span aria-hidden='true' className={`${timelineLineClassName} ${lineColor}`} />}
              <span aria-hidden='true' className={`${timelineMarkerClassName} ${markerColor}`}>
                {showCheck ? <Check size={11} /> : <span className='h-1 w-1 rounded-full bg-current' />}
              </span>
              <div className='min-w-0 min-[1180px]:mt-3'>
                <p className={labelClass}>{step.label}</p>
                <span className='sr-only'>{getStepStatus(step)}</span>
                {step.reached && date && <p className='mt-1 text-[11px] leading-[1.6]'>{date}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default OrderTimeline
