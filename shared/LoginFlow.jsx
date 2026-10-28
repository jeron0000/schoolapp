import { useEffect, useRef, useState } from 'react'
import campus from './assets/login-campus.jpg'
import { ArrowLeft, ArrowRight, Banknote, Check, CircleAlert, Eye, EyeOff, GraduationCap, LayoutDashboard, LockKeyhole, Mail } from './LoginIcons'
import { getAcademicProgramOptions } from './productTaxonomy.js'
import './LoginFlow.css'

const options = {
  account: [
    ['student', 'Student Storefront', 'Browse merchandise, place orders, track status.', GraduationCap],
    ['admin', 'Administration', 'Access your authorized staff workspace.', LayoutDashboard]
  ],
  panel: [
    ['pamo', 'PAMO Admin', 'Manage merchandise, stock, and student orders.', LayoutDashboard],
    ['cashier', 'Cashier', 'Confirm payments and coordinate claiming.', Banknote]
  ]
}
const rootClassName = [
  'shared-login relative isolate flex min-h-[100svh] min-w-0 flex-col px-4 py-4',
  'text-[color:var(--pamo-color-text-primary)] sm:px-6 sm:py-5',
  '[&_button]:text-sm [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-[.55]'
].join(' ')

const shellClassName = 'login-shell mx-auto grid w-full min-w-0 flex-1 items-center justify-items-center'
const cardBaseClassName = [
  'login-card w-full min-w-0 max-w-[460px] rounded-xl border',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'px-5 py-6 sm:px-8 sm:py-8'
].join(' ')

const primaryButtonClassName = [
  'inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[7px] p-3',
  'bg-[var(--pamo-color-brand-yellow)] font-semibold leading-6 text-slate-950',
  'hover:bg-[var(--pamo-color-brand-hover)] active:bg-[var(--pamo-color-brand-pressed)]',
  'min-[1180px]:min-h-14 min-[1180px]:p-4'
].join(' ')

const fieldControlClassName = [
  'relative mt-2 flex min-w-0 items-center gap-2.5 rounded-[7px] border border-[color:var(--pamo-color-border-input)]',
  'bg-[var(--pamo-color-surface-subtle)] pl-3 focus-within:outline focus-within:outline-2',
  'focus-within:outline-offset-2 focus-within:outline-[color:var(--pamo-color-accent-text)]',
  '[&>svg]:hidden [&>svg]:shrink-0 min-[1180px]:[&>svg]:block'
].join(' ')

const inputClassName = [
  'min-h-12 w-full min-w-0 rounded-[7px] border-0 bg-transparent py-3 pl-0 pr-3 text-base font-normal leading-6',
  'text-[color:var(--pamo-color-text-primary)] outline-none placeholder:text-[color:var(--pamo-color-text-secondary)]',
  'disabled:bg-transparent disabled:text-[color:var(--pamo-color-text-secondary)] focus-visible:!outline-none'
].join(' ')
const nativeSelectClassName = [
  inputClassName,
  'appearance-auto [color-scheme:light] dark:[color-scheme:dark]',
  '[&>option]:bg-[var(--pamo-color-surface-default)] [&>option]:text-[color:var(--pamo-color-text-primary)]'
].join(' ')
const errorMessage = error => {
  const message = error?.response?.data?.message || error?.message
  return typeof message === 'string' && message.trim() ? message : 'Unable to continue. Please try again.'
}

const panelName = panel => panel === 'cashier' ? 'Cashier' : 'PAMO Admin'

const loginTitle = (step, panel) => {
  if (step === 'account') return 'Choose your account type'
  if (step === 'panel') return 'Choose your admin panel'
  if (step === 'studentLogin') return 'Sign in as Student'
  return `Sign in to ${panelName(panel)}`
}

const Choices = ({ kind, selected, onSelect, compact = false }) => {
  const marginClassName = compact
    ? 'mt-4'
    : 'mt-6'
  return <div role='group' aria-label={kind === 'account' ? 'Account type' : 'Admin panel'} className={`${marginClassName} grid gap-3`}>
  {options[kind].map(option => {
    const [value, label, description, Icon] = option
    const isSelected = selected === value
    const selectedClassName = isSelected
      ? 'border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] shadow-[inset_0_0_0_1px_var(--pamo-color-brand-yellow)]'
      : 'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] hover:border-[color:var(--pamo-color-border-input)]'
    return <button key={value} type='button' aria-pressed={isSelected} onClick={() => onSelect(value)} className={`relative flex min-h-24 w-full min-w-0 items-start gap-3 rounded-lg border px-3.5 py-4 text-left ${selectedClassName}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${isSelected ? 'bg-[var(--pamo-color-surface-navy)] text-[color:var(--pamo-color-brand-yellow)]' : 'bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)]'}`}><Icon size={22} strokeWidth={1.75} aria-hidden='true' /></span>
      <span className='min-w-0 flex-1 pr-5 [overflow-wrap:anywhere]'><strong className='block text-base font-semibold leading-6 text-[color:var(--pamo-color-text-primary)]'>{label}</strong><span className='mt-1 block text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>{description}</span></span>
      <span className={`absolute right-3.5 top-[19px] flex h-[18px] w-[18px] items-center justify-center rounded-full border text-slate-950 ${isSelected ? 'border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-brand-yellow)]' : 'border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)]'}`} aria-hidden='true'>{isSelected && <Check size={12} strokeWidth={2.5} />}</span>
    </button>
  })}
</div>
}

const LoginHeading = ({ title, description, headingRef, credentials = false }) => <div className='mt-6 text-center'><h1 ref={headingRef} tabIndex={-1} id='login-heading' className='text-[22px] font-semibold leading-[1.35] tracking-[-.02em] text-[color:var(--pamo-color-text-primary)] [overflow-wrap:anywhere] sm:text-2xl'>{title}</h1><p className={`mt-2 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] ${credentials ? 'hidden md:block' : ''}`}>{description}</p></div>
const LoginError = ({ message }) => message && <div id='login-form-error' className='mt-5 flex items-start gap-2.5 rounded-[7px] border border-[color:var(--pamo-color-error)] bg-[var(--pamo-color-error-surface)] p-3 text-[13px] leading-[1.6] text-[color:var(--pamo-color-error-text)] [overflow-wrap:anywhere] dark:border-[color:var(--pamo-color-error-text)]'><CircleAlert className='mt-0.5 shrink-0' size={18} aria-hidden='true' /><p>{message}</p></div>
const BackButton = ({ label, busy, onBack, className = '' }) => <button type='button' disabled={busy} onClick={onBack} className={`mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-[5px] py-2 text-left font-semibold leading-[1.6] text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-text-primary)] ${className}`}><ArrowLeft size={15} aria-hidden='true' />{label}</button>

const credentialCopy = ({ student, register, busy, heading, submitTitle }) => {
  if (register) {
    return {
      heading: 'Create your Student account',
      description: 'Enter your details to get started with PAMO.',
      note: 'Use at least 8 characters.',
      submit: busy ? 'Creating account…' : 'Create Student account',
      support: 'Registration is for students. Staff accounts are managed separately.'
    }
  }
  if (student) {
    return {
      heading,
      description: 'Enter your student account credentials.',
      note: 'Use your student account credentials.',
      submit: busy ? 'Signing in…' : submitTitle,
      support: 'Account access trouble? Contact campus support.'
    }
  }
  return {
    heading,
    description: 'Enter your assigned staff credentials.',
    note: 'Use your assigned staff account credentials.',
    submit: busy ? 'Signing in…' : submitTitle,
    support: 'Need staff access help? Contact your administrator.'
  }
}

const credentialBackLabel = (student, register) => {
  if (register) return 'Back to Student sign in'
  if (student) return 'Change account type'
  return 'Choose another admin panel'
}

const CredentialForm = ({
  title,
  heading,
  headingRef,
  student,
  register,
  programOptions,
  programsLoading,
  programsError,
  onRegister,
  onBack,
  onSubmit,
  busy,
  error,
  clearError = () => {},
}) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [academicProgram, setAcademicProgram] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const descriptionId = [register && 'login-password-hint', error && 'login-form-error'].filter(Boolean).join(' ') || undefined
  const backLabel = credentialBackLabel(student, register)
  const copy = credentialCopy({ student, register, busy, heading, submitTitle: title })
  const submitCredentials = event => {
    event.preventDefault()
    const credentials = { email, password }
    if (register) {
      credentials.name = name
      credentials.academicProgram = academicProgram
    }
    onSubmit(credentials, register)
  }
  const toggleRegistration = () => {
    onRegister(!register)
    clearError()
  }
  const fieldGapClassName = register
    ? 'gap-3 md:gap-4 min-[1180px]:gap-[clamp(16px,1vw,24px)]'
    : 'gap-5 md:gap-6 min-[1180px]:gap-[clamp(24px,1.5vw,32px)]'
  return <form onSubmit={submitCredentials} className='flex min-w-0 flex-col' aria-labelledby='login-heading' aria-describedby={error ? 'login-form-error' : undefined} aria-busy={busy}>
    <LoginHeading title={copy.heading} description={copy.description} headingRef={headingRef} credentials />
    <BackButton label={backLabel} busy={busy} onBack={onBack} className='hidden md:mt-[26px] md:inline-flex' />
    <LoginError message={error} />
    <div className={`mt-5 grid min-w-0 md:mt-2 ${fieldGapClassName}`}>
      {student && register && <label className='block min-w-0 text-sm font-medium leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-[clamp(14px,calc(10px+.28vw),17px)]'>Name<span className={fieldControlClassName}><input className={inputClassName} required autoComplete='name' value={name} disabled={busy} onChange={event => { setName(event.target.value); clearError() }} placeholder='Your full name' /></span></label>}
      {student && register && <label className='block min-w-0 text-sm font-medium leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-[clamp(14px,calc(10px+.28vw),17px)]'>
        Academic program
        <span className={fieldControlClassName}>
          <select
            className={nativeSelectClassName}
            required
            value={academicProgram}
            disabled={busy}
            onChange={event => {
              setAcademicProgram(event.target.value)
              clearError()
            }}
          >
            <option value='' disabled>Select your program</option>
            {programOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </span>
        {programsLoading && <span role='status' className='mt-1.5 block text-xs text-[color:var(--pamo-color-text-secondary)]'>Loading the latest programs...</span>}
        {programsError && <span role='alert' className='mt-1.5 block text-xs text-[color:var(--pamo-color-error-text)]'>New program options are temporarily unavailable. Existing programs remain available.</span>}
      </label>}
      <label className='block min-w-0 text-sm font-medium leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-[clamp(14px,calc(10px+.28vw),17px)]'>Email address<span className={fieldControlClassName}>{!register && <Mail size={18} aria-hidden='true' />}<input className={inputClassName} required type='email' autoComplete={student ? 'email' : 'username'} value={email} disabled={busy} onChange={event => { setEmail(event.target.value); clearError() }} placeholder='you@example.com' aria-describedby={error ? 'login-form-error' : undefined} /></span></label>
      <div className='block min-w-0 text-sm font-medium leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-[clamp(14px,calc(10px+.28vw),17px)]'><label htmlFor='login-password'>Password</label><div className={fieldControlClassName}>{!register && <LockKeyhole size={18} aria-hidden='true' />}<input className={`${inputClassName} pr-[76px]`} id='login-password' required type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={event => { setPassword(event.target.value); clearError() }} placeholder={register ? 'Create a password' : 'Enter your password'} aria-describedby={descriptionId} /><button type='button' disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className='absolute right-0.5 top-0.5 inline-flex min-h-11 w-[70px] items-center justify-center gap-1.5 rounded-[5px] px-1.5 py-2 !text-[13px] text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-text-primary)]'>{showPassword ? <EyeOff size={16} aria-hidden='true' /> : <Eye size={16} aria-hidden='true' />}<span>{showPassword ? 'Hide' : 'Show'}</span></button></div></div>
    </div>
    <p className={`mt-2 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:block min-[1180px]:text-[clamp(13px,.75vw,15px)] ${register ? 'block' : 'hidden'}`} id={register ? 'login-password-hint' : undefined}>{copy.note}</p>
    <button type='submit' disabled={busy} className={`login-primary ${primaryButtonClassName} mt-7 min-[1180px]:mt-[clamp(28px,1.7vw,36px)]`} aria-busy={busy}>{copy.submit}{!busy && <ArrowRight size={16} aria-hidden='true' />}</button>
    <p role='status' className='sr-only'>{busy ? 'Please wait while your request is processed.' : ''}</p>
    {!student && <p className='mt-7 text-[13px] leading-[1.7] text-[color:var(--pamo-color-text-secondary)] md:hidden'>Staff accounts cannot be registered publicly.</p>}
    {student && <div className='mt-2 flex flex-wrap items-center justify-center gap-x-2 text-sm text-[color:var(--pamo-color-text-secondary)] md:mt-4 min-[1180px]:text-[clamp(14px,calc(10px+.28vw),17px)]'><span>{register ? 'Already have an account?' : 'New to PAMO?'}</span><button type='button' disabled={busy} onClick={toggleRegistration} className='inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[5px] px-1 py-2 font-semibold text-[color:var(--pamo-color-accent-text)] hover:underline hover:underline-offset-4'>{register ? 'Sign in' : 'Create student account'}<ArrowRight size={14} aria-hidden='true' /></button></div>}
    <p className='mt-11 hidden text-center text-[13px] leading-[1.7] text-[color:var(--pamo-color-text-secondary)] md:block min-[1180px]:text-[clamp(13px,.75vw,15px)]'>{copy.support}</p>
    <BackButton label={backLabel} busy={busy} onBack={onBack} className='mt-2 md:hidden' />
  </form>
}

const LoginFlow = ({
  host,
  logo,
  themeToggle,
  initialPanel = 'pamo',
  initialStep = 'account',
  programOptions = getAcademicProgramOptions([]),
  programsLoading = false,
  programsError = '',
  onStudent,
  onAdmin,
  onAuthenticate,
  onError,
  studentAuthenticated = false,
}) => {
  const [step, setStep] = useState(initialStep)
  const [account, setAccount] = useState(initialStep === 'adminLogin' ? 'admin' : 'student')
  const [panel, setPanel] = useState(initialPanel)
  const [busy, setBusy] = useState(false)
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const headingRef = useRef(null)
  const previousView = useRef(step + String(register))
  useEffect(() => {
    const view = step + String(register)
    if (previousView.current !== view) headingRef.current?.focus()
    previousView.current = view
  }, [step, register])
  const title = loginTitle(step, panel)
  const advance = () => {
    setError('')
    try {
      if (step === 'account') {
        if (account === 'admin') setStep('panel')
        else if (host !== 'student' || studentAuthenticated) onStudent()
        else setStep('studentLogin')
      } else if (host === 'admin') setStep('adminLogin')
      else onAdmin(panel)
    } catch (error) {
      const message = errorMessage(error)
      setError(message)
      onError(message)
    }
  }
  const authenticate = async (credentials, register) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await onAuthenticate(credentials, { register, panel })
    } catch (error) {
      const message = errorMessage(error)
      setError(message)
      onError(message)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const goBack = () => {
    setError('')
    if (register) setRegister(false)
    else setStep(step === 'adminLogin' ? 'panel' : 'account')
  }
  const credentialsStep = step === 'studentLogin' || step === 'adminLogin'
  const credentialTitle = step === 'studentLogin' ? 'Sign in as Student' : `Sign in as ${panelName(panel)}`
  const mobileSupport = step === 'studentLogin'
    ? 'Access issues? Contact campus support.'
    : 'Staff access trouble? Contact your administrator.'
  const credentialsMobileSupport = register ? 'Registration is available for students only.' : mobileSupport
  const choiceKind = step === 'account' ? 'account' : 'panel'
  const choiceSelection = step === 'account' ? account : panel
  let continueLabel = 'Continue'
  if (step === 'panel') continueLabel = `Continue to ${panelName(panel)}`
  const selectChoice = value => {
    setError('')
    if (step === 'account') {
      setAccount(value)
      return
    }
    setPanel(value)
  }
  return <section className={rootClassName} style={{ '--login-campus-image': `url("${campus}")` }}>
    <header className='flex min-h-11 w-full items-center justify-end'><div className='rounded-full bg-[var(--pamo-color-surface-default)] shadow-sm'>{themeToggle}</div></header>
    <div className={shellClassName}>
      <div className={cardBaseClassName}>
        <div className='flex min-w-0 items-center justify-center gap-3'><img className='h-12 w-12 shrink-0 rounded-lg bg-white p-1 object-contain' src={logo} alt='PAMO' width='48' height='48' /><div className='min-w-0'><p className='text-[22px] font-bold leading-tight tracking-[-.02em]'>PAMO</p><p className='mt-1 text-[11px] leading-4 text-[color:var(--pamo-color-text-secondary)]'>School essentials · SmartStock</p></div></div>
        {credentialsStep ? <CredentialForm key={step + panel} student={step === 'studentLogin'} register={register} programOptions={programOptions} programsLoading={programsLoading} programsError={programsError} onRegister={setRegister} onBack={goBack} title={credentialTitle} heading={title} headingRef={headingRef} busy={busy} onSubmit={authenticate} error={error} clearError={() => setError('')} /> : <>
          <LoginHeading title={title} description={step === 'account' ? 'Select how you want to access PAMO.' : 'Select the staff workspace you need.'} headingRef={headingRef} />
          <LoginError message={error} />
          {step === 'panel' && <BackButton label='Change account type' onBack={goBack} className='md:mt-[26px]' />}
          <Choices kind={choiceKind} selected={choiceSelection} onSelect={selectChoice} compact={step === 'panel'} />
          <button type='button' onClick={advance} className={`login-primary ${primaryButtonClassName} mt-6`}>{continueLabel}<ArrowRight size={16} aria-hidden='true' /></button>
          {step === 'account' && <p className='mt-4 text-center text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>You can return and change your account type.</p>}
        </>}
        {credentialsStep && <p className='mt-6 text-center text-xs leading-[1.7] text-[color:var(--pamo-color-text-secondary)] md:hidden'>{credentialsMobileSupport}</p>}
      </div>
    </div>
  </section>
}

export default LoginFlow
