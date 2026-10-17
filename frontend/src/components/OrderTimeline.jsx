import { Check } from 'lucide-react'
import { formatOrderDate, getOrderPresentation, getOrderTimeline } from '../utils/orderPresentation'

const OrderTimeline = ({ order, id }) => {
  const presentation = getOrderPresentation(order)
  if (presentation.group === 'Cancelled') return <div id={id} className='order-timeline'><p>This order was cancelled.</p><p>The fulfillment workflow has ended.</p></div>
  if (!presentation.current) return <p id={id} className='order-timeline'>Detailed progress is unavailable for this order status.</p>
  const steps = getOrderTimeline(order)
  return <div id={id} aria-label={'Order progress: ' + presentation.label} className={'order-timeline' + (presentation.group === 'Completed' ? ' is-completed' : '')}>
    <ol className='order-timeline-steps'>{steps.map((step, index) => {
      const date = formatOrderDate(step.date)
      return <li key={step.key} aria-current={step.current ? 'step' : undefined} className={(step.reached ? 'is-reached' : '') + (step.current ? ' is-current' : '')}>
        {index < steps.length - 1 && <span aria-hidden='true' className={'order-timeline-line' + (step.reached && steps[index + 1].reached ? ' is-reached' : '')} />}
        <span aria-hidden='true' className='order-timeline-marker'>{step.reached && !step.current ? <Check size={11} /> : <span />}</span>
        <div><p className='order-step-label'>{step.label}</p><span className='sr-only'>{step.current ? ', current stage' : step.reached ? ', reached' : ', not reached'}</span>{step.reached && date && <p className='order-step-date'>{date}</p>}</div>
      </li>
    })}</ol>
  </div>
}

export default OrderTimeline
