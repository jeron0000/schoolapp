import React, { useRef, useState } from 'react'
import students from '../frontend/src/assets/login_students.png'

const options = {
  account: [
    ['student', 'Student', 'Shop, track orders and more.', 'M2 8l10-5 10 5-10 5Z M6 10v6c4 3 8 3 12 0v-6M22 8v8'],
    ['admin', 'Admin', 'Manage products, orders and payments.', 'M9 3h6l1 4 4 1v6l-4 1-1 4H9l-1-4-4-1V8l4-1Z M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0']
  ],
  panel: [
    ['pamo', 'PAMO Admin', 'Manage products, orders, students and more.', 'M4 21v-4a5 5 0 0 1 10 0v4M17 12a5 5 0 0 1 4 5v4M12 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M16 3a3 3 0 0 1 0 6'],
    ['cashier', 'Cashier Admin', 'Process and confirm payments.', 'M4 9h16v12H4Z M3 9l2-6h14l2 6 M8 14h8v4H8Z']
  ]
}

const Icon = ({ path, className = 'h-5 w-5' }) => <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={className}><path d={path}/></svg>

const Choices = ({ kind, selected, onSelect }) => <div role='group' aria-label={kind === 'account' ? 'Account type' : 'Admin panel'} className='mt-6 grid gap-3 min-[430px]:grid-cols-2'>
  {options[kind].map(([value, label, description, path]) => <button key={value} type='button' aria-pressed={selected === value} onClick={() => onSelect(value)} className={'min-w-0 rounded-xl border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ' + (selected === value ? 'border-amber-400 bg-amber-50 dark:bg-amber-400/10' : 'border-slate-200 bg-slate-50/70 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/60')}>
    <span className='flex items-center justify-between gap-3'><Icon path={path} className={'h-7 w-7 ' + (selected === value ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-300')}/><span aria-hidden='true' className={'flex h-4 w-4 items-center justify-center rounded-full border ' + (selected === value ? 'border-amber-500' : 'border-slate-400')}>{selected === value && <span className='h-2.5 w-2.5 rounded-full bg-amber-400'/>}</span></span>
    <strong className='mt-3 block text-sm font-semibold text-slate-950 dark:text-slate-100'>{label}</strong><span className='mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-400'>{description}</span>
  </button>)}
</div>

const Welcome = () => <aside className='order-2 mx-auto w-full min-w-0 max-w-md md:order-1 md:mx-0 md:max-w-none'>
  <p className='max-w-xs text-xs font-semibold uppercase leading-6 tracking-[0.18em] text-slate-500 dark:text-slate-400'>Your school essentials,<br/>made easier.</p>
  <h1 className='mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 lg:text-6xl dark:text-slate-100'>Welcome<br/><span className='relative inline-block pb-3 text-amber-500 dark:text-amber-400'>back.<svg aria-hidden='true' viewBox='0 0 200 12' className='absolute bottom-0 left-0 h-3 w-full fill-none stroke-current' strokeWidth='2.5'><path d='M2 9Q92-3 197 6M115 9l64-3'/></svg></span></h1>
  <p className='mt-3 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400'>Sign in to access your PAMO account and continue where you left off.</p>
  <ul className='mt-6 space-y-4'>
    {[
      ['Shop School Essentials', 'Browse and order your school needs.', 'bg-amber-100 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400', 'M3 3h2l3 12h10l3-9H6M9 18h9M9 21h.01M18 21h.01'],
      ['Track Your Orders', 'Check your order status anytime.', 'bg-blue-100 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400', 'm12 3 9 5-9 5-9-5 9-5ZM3 8v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5'],
      ['Manage and Fulfill', 'For admins and cashiers.', 'bg-emerald-100 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400', 'm8 3-5 3-2 5 4 2 2-3v11h10V10l2 3 4-2-2-5-5-3c0 4-8 4-8 0Z']
    ].map(([title, description, color, path]) => <li key={title} className='flex items-center gap-3'><span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ' + color}><Icon path={path}/></span><div><p className='text-sm font-semibold text-slate-950 dark:text-slate-100'>{title}</p><p className='mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400'>{description}</p></div></li>)}
  </ul>
  <img src={students} alt='Students in school uniforms with a guitar, basketball, laptop, and camera' className='mx-auto mt-6 h-auto w-full max-w-[440px] object-contain md:mx-0'/>
</aside>

const CredentialForm = ({ title, student, onSubmit, busy }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [register, setRegister] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const fieldClass = 'min-h-12 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
  return <form onSubmit={event => { event.preventDefault(); onSubmit({ email, password, ...(register ? { name } : {}) }, register) }} className='mt-6 space-y-4'>
    {student && register && <label className='block text-xs font-medium text-slate-600 dark:text-slate-400'>Name<input required autoComplete='name' value={name} disabled={busy} onChange={event => setName(event.target.value)} className={fieldClass + ' mt-2 pl-3'} placeholder='Your name'/></label>}
    <label className='block text-xs font-medium text-slate-600 dark:text-slate-400'>Email Address<span className='relative mt-2 block'><span className='pointer-events-none absolute left-3 top-3.5'><Icon path='M3 5h18v14H3Z m0 1 9 7 9-7' className='h-5 w-5'/></span><input required type='email' autoComplete={student ? 'email' : 'username'} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} className={fieldClass} placeholder='you@example.com'/></span></label>
    <div><label className='block text-xs font-medium text-slate-600 dark:text-slate-400' htmlFor='login-password'>Password</label><div className='relative mt-2'><span className='pointer-events-none absolute left-3 top-3.5 text-slate-500 dark:text-slate-400'><Icon path='M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3'/></span><input id='login-password' required type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className={fieldClass + ' pr-12'} placeholder='Enter your password'/><button type='button' disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className='absolute right-0 top-0 flex h-12 w-11 items-center justify-center rounded-lg text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 dark:text-slate-400'><Icon path={'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0' + (showPassword ? ' M3 3l18 18' : '')}/></button></div></div>
    <button type='submit' disabled={busy} className='flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-60'><Icon path='M14 3h6v18h-6M3 12h13m-5-5 5 5-5 5'/>{busy ? 'Signing in…' : register ? 'Create account' : title}</button>
    {student && <button type='button' disabled={busy} onClick={() => setRegister(value => !value)} className='min-h-11 w-full rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:text-slate-100'>{register ? 'Back to sign in' : 'Create account'}</button>}
    <p className='flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400'><Icon path='M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z m-4 9 3 3 5-6' className='h-4 w-4'/><span>Your data is safe with us.</span></p>
  </form>
}

const LoginFlow = ({ host, logo, themeToggle, initialPanel = 'pamo', initialStep = 'account', onStudent, onAdmin, onAuthenticate, onError, studentAuthenticated = false }) => {
  const [step, setStep] = useState(initialStep)
  const [account, setAccount] = useState(initialStep === 'adminLogin' ? 'admin' : 'student')
  const [panel, setPanel] = useState(initialPanel)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const title = step === 'account' ? 'Choose your account type' : step === 'panel' ? 'Choose Admin Panel' : step === 'studentLogin' ? 'Login to your Student account' : `Login to ${panel === 'cashier' ? 'Cashier' : 'PAMO'} Admin`
  const advance = () => {
    try {
      if (step === 'account') {
        if (account === 'admin') setStep('panel')
        else if (host !== 'student' || studentAuthenticated) onStudent()
        else setStep('studentLogin')
      } else if (host === 'admin') setStep('adminLogin')
      else onAdmin(panel)
    } catch (error) { onError(error.message) }
  }
  const authenticate = async (credentials, register) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try { await onAuthenticate(credentials, { register, panel }) }
    catch (error) { onError(error.response?.data?.message || error.message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className='relative isolate flex min-h-screen items-center overflow-hidden bg-slate-50 px-4 py-20 text-slate-900 sm:px-6 dark:bg-slate-950 dark:text-slate-100'>
    <div className='absolute right-4 top-4 z-10 sm:right-6 sm:top-6'>{themeToggle}</div>
    <div aria-hidden='true' className='pointer-events-none absolute -left-24 bottom-0 -z-10 h-72 w-72 rounded-full bg-amber-100/60 dark:bg-amber-400/5'/>
    <div aria-hidden='true' className='pointer-events-none absolute -right-24 -top-40 -z-10 h-96 w-96 rounded-full bg-amber-100/50 dark:bg-amber-400/5'/>
    <div className='mx-auto grid w-full max-w-[1040px] items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20'>
      <Welcome/>
      <div className='order-1 mx-auto w-full max-w-md self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 md:order-2 dark:border-slate-800 dark:bg-slate-900/60'>
        {step !== 'account' && <button type='button' disabled={busy} onClick={() => setStep(step === 'adminLogin' ? 'panel' : 'account')} className='mb-1 flex min-h-11 items-center gap-1 rounded text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:text-slate-300'><Icon path='m14 6-6 6 6 6' className='h-4 w-4'/>Back</button>}
        <div className='text-center'><img src={logo} alt='PAMO' className='mx-auto h-14 w-14 rounded-lg border border-slate-200 bg-white p-1 object-contain'/><p className='mt-1 text-xl font-bold tracking-tight text-slate-950 dark:text-slate-100'>PAMO</p><p className='text-[10px] text-slate-500 dark:text-slate-400'>School essentials</p><div aria-hidden='true' className='mx-auto mt-2 h-1 w-9 rounded-full bg-amber-400'/></div>
        <h2 className='mt-4 text-center text-lg font-semibold leading-6 text-slate-950 dark:text-slate-100'>{title}</h2>
        <p className='mt-2 text-center text-xs leading-5 text-slate-600 dark:text-slate-400'>{step === 'account' ? 'Select how you want to access PAMO.' : step === 'panel' ? 'Select the panel you want to access.' : 'Enter your credentials to continue.'}</p>
        {step === 'account' || step === 'panel' ? <><Choices kind={step === 'account' ? 'account' : 'panel'} selected={step === 'account' ? account : panel} onSelect={step === 'account' ? setAccount : setPanel}/><button type='button' onClick={advance} className='mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500'>Continue<Icon path='M4 12h16m-6-6 6 6-6 6' className='h-4 w-4'/></button></> : <CredentialForm key={step + panel} student={step === 'studentLogin'} title={step === 'studentLogin' ? 'Login as Student' : title} busy={busy} onSubmit={authenticate}/>}
      </div>
    </div>
  </section>
}

export default LoginFlow
