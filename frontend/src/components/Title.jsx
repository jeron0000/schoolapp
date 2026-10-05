import React from 'react'

const Title = ({text1,text2}) => {
  return (
    <div className='mb-4 flex items-center gap-3'>
      <span className='h-7 w-1 shrink-0 rounded-full bg-amber-500' aria-hidden='true' />
      <h2 className='text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl'>
        <span className='font-normal text-slate-500 dark:text-slate-400'>{text1}</span> {text2}
      </h2>
    </div>
  )
}

export default Title
