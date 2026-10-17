import { Link } from 'react-router-dom'

const Verify = () => (
  <section className='page-section flex min-h-[50vh] items-center justify-center'>
    <div className='panel w-full max-w-md px-6 py-12 text-center'>
      <h1 className='text-xl font-semibold'>Online payment needs review</h1>
      <p role='status' className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>
        Online payment confirmation is temporarily unavailable. This page cannot confirm whether your payment completed.
      </p>
      <p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>
        Check My Orders before retrying. If you already paid online, contact PAMO for review.
      </p>
      <div className='mt-6 flex flex-wrap justify-center gap-3'>
        <Link to='/orders' className='btn-primary'>My Orders</Link>
        <Link to='/contact' className='btn-secondary'>Contact PAMO</Link>
      </div>
    </div>
  </section>
)

export default Verify
