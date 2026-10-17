import { useEffect, useRef, useState } from 'react'
import students from './assets/login_students.png'
import studentsSmall from './assets/login_students-393.png'
import studentsMedium from './assets/login_students-655.png'
import { ArrowLeft, ArrowRight, Banknote, Check, CircleAlert, Eye, EyeOff, GraduationCap, LayoutDashboard, LockKeyhole, Mail, Package, ShoppingBag } from './LoginIcons'
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
const studentFeatures = [['Shop school essentials', 'Browse uniforms, merchandise and available sizes.', ShoppingBag], ['Track your orders', 'Check approval, payment and claiming progress.', Package]]
const welcomeContent = {
  account: { intro: 'One place for school essentials, orders, and staff operations.', mobile: 'School essentials and operations, in one place.', features: studentFeatures },
  panel: { intro: 'Sign in to the workspace assigned to your responsibilities.', mobile: 'Select the staff workspace you need.', features: [['Manage merchandise', 'Review products and available stock.', LayoutDashboard], ['Oversee orders', 'Coordinate approvals and order updates.', Package]] },
  student: { intro: 'Sign in to browse campus essentials, manage your orders, and pick up where you left off.', mobile: 'Sign in to continue with your campus essentials.', features: studentFeatures },
  register: { intro: 'Create your student account and start managing school essentials in one place.', mobile: 'Create your student account to get started.', features: studentFeatures },
  pamo: { intro: 'Access your authorized inventory, merchandise and order operations. Access is verified after sign-in.', mobile: 'Access your assigned staff workspace.', features: [['Manage inventory', 'Review products and size-specific availability.', LayoutDashboard], ['Review student orders', 'Follow order approvals and status updates.', Package]] },
  cashier: { intro: 'Access your authorized payment and claiming operations. Access is verified after sign-in.', mobile: 'Access your assigned staff workspace.', features: [['Verify payments', 'Review eligible transactions and payment details.', Banknote], ['Support order releases', 'Coordinate paid orders and collection progress.', Package]] }
}
const errorMessage = error => {
  const message = error?.response?.data?.message || error?.message
  return typeof message === 'string' && message.trim() ? message : 'Unable to continue. Please try again.'
}

const Choices = ({ kind, selected, onSelect }) => <div role='group' aria-label={kind === 'account' ? 'Account type' : 'Admin panel'} className='login-choices'>
  {options[kind].map(option => {
    const [value, label, description, Icon] = option
    return <button key={value} type='button' aria-pressed={selected === value} onClick={() => onSelect(value)} className='login-choice'>
    <span className='login-choice-symbol'><Icon size={24} strokeWidth={1.75} aria-hidden='true' /></span><span className='login-choice-content'><strong>{label}</strong><span>{description}</span></span><span className='login-choice-indicator' aria-hidden='true'>{selected === value && <Check size={12} strokeWidth={2.5} />}</span>
    </button>
  })}
</div>

const Welcome = ({ stage }) => {
  const content = welcomeContent[stage]
  const returning = ['student', 'pamo', 'cashier'].includes(stage)
  return <aside className='login-welcome'>
    <p className='login-kicker'>PAMO / SmartStock</p><p className='login-slogan'>Your school essentials,<br />made easier.</p><p className='login-mobile-slogan'>Your school essentials, made easier</p>
    <h2><span className='login-welcome-desktop'>Welcome<span className={returning ? 'login-welcome-accent' : 'login-welcome-accent is-new'}>{returning ? 'back.' : 'to PAMO.'}</span></span><span className='login-welcome-mobile'>{stage === 'pamo' || stage === 'cashier' ? 'Staff sign in.' : returning ? 'Welcome back.' : 'Welcome to PAMO.'}</span></h2>
    <p className='login-welcome-intro'><span className='login-welcome-desktop'>{content.intro}</span><span className='login-welcome-mobile'>{content.mobile}</span></p>
    <ul className='login-benefits'>{content.features.map(feature => {
      const [title, description, Icon] = feature
      return <li key={title}><span><Icon size={21} strokeWidth={1.75} aria-hidden='true' /></span><div><p>{title}</p><p>{description}</p></div></li>
    })}</ul>
  </aside>
}

const LoginHeading = ({ title, description, headingRef }) => <div className='login-heading'><h1 ref={headingRef} tabIndex={-1} id='login-heading'>{title}</h1><p>{description}</p></div>
const LoginError = ({ message }) => message && <div id='login-form-error' className='login-error'><CircleAlert size={18} aria-hidden='true' /><p>{message}</p></div>
const BackButton = ({ label, busy, onBack, className = '' }) => <button type='button' disabled={busy} onClick={onBack} className={'login-back ' + className}><ArrowLeft size={15} aria-hidden='true' />{label}</button>

const CredentialForm = ({ title, heading, headingRef, student, register, onRegister, onBack, onSubmit, busy, error, clearError = () => {} }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const descriptionId = [register && 'login-password-hint', error && 'login-form-error'].filter(Boolean).join(' ') || undefined
  const backLabel = register ? 'Back to Student sign in' : student ? 'Change account type' : 'Choose another admin panel'
  return <form onSubmit={event => { event.preventDefault(); onSubmit({ email, password, ...(register ? { name } : {}) }, register) }} className='login-form' aria-labelledby='login-heading' aria-describedby={error ? 'login-form-error' : undefined} aria-busy={busy}>
    <LoginHeading title={register ? 'Create your Student account' : heading} description={register ? 'Enter your details to get started with PAMO.' : student ? 'Enter your student account credentials.' : 'Enter your assigned staff credentials.'} headingRef={headingRef} />
    <BackButton label={backLabel} busy={busy} onBack={onBack} className='login-back-desktop' />
    <LoginError message={error} />
    <div className='login-fields'>
      {student && register && <label className='login-field'>Name<span><input required autoComplete='name' value={name} disabled={busy} onChange={event => { setName(event.target.value); clearError() }} placeholder='Your full name' /></span></label>}
      <label className='login-field'>Email address<span>{!register && <Mail size={18} aria-hidden='true' />}<input required type='email' autoComplete={student ? 'email' : 'username'} value={email} disabled={busy} onChange={event => { setEmail(event.target.value); clearError() }} placeholder='you@example.com' aria-describedby={error ? 'login-form-error' : undefined} /></span></label>
      <div className='login-field'><label htmlFor='login-password'>Password</label><div className='login-password-field'>{!register && <LockKeyhole size={18} aria-hidden='true' />}<input id='login-password' required type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={event => { setPassword(event.target.value); clearError() }} placeholder={register ? 'Create a password' : 'Enter your password'} aria-describedby={descriptionId} /><button type='button' disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className='login-password-toggle'>{showPassword ? <EyeOff size={16} aria-hidden='true' /> : <Eye size={16} aria-hidden='true' />}<span>{showPassword ? 'Hide' : 'Show'}</span></button></div></div>
    </div>
    <p className='login-credential-note' id={register ? 'login-password-hint' : undefined}>{register ? 'Use at least 8 characters.' : student ? 'Use your student account credentials.' : 'Use your assigned staff account credentials.'}</p>
    <button type='submit' disabled={busy} className='login-primary' aria-busy={busy}>{busy ? register ? 'Creating account…' : 'Signing in…' : register ? 'Create Student account' : title}{!busy && <ArrowRight size={16} aria-hidden='true' />}</button>
    <p role='status' className='sr-only'>{busy ? 'Please wait while your request is processed.' : ''}</p>
    {!student && <p className='login-staff-note'>Staff accounts cannot be registered publicly.</p>}
    {student && <div className='login-registration-link'><span>{register ? 'Already have an account?' : 'New to PAMO?'}</span><button type='button' disabled={busy} onClick={() => { onRegister(!register); clearError() }} className='login-text-action'>{register ? 'Sign in' : 'Create student account'}<ArrowRight size={14} aria-hidden='true' /></button></div>}
    <p className='login-support'>{register ? 'Registration is for students. Staff accounts are managed separately.' : student ? 'Account access trouble? Contact campus support.' : 'Need staff access help? Contact your administrator.'}</p>
    <BackButton label={backLabel} busy={busy} onBack={onBack} className='login-back-mobile' />
  </form>
}

const LoginFlow = ({ host, logo, themeToggle, initialPanel = 'pamo', initialStep = 'account', onStudent, onAdmin, onAuthenticate, onError, studentAuthenticated = false }) => {
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
  const title = step === 'account' ? 'Choose your account type' : step === 'panel' ? 'Choose your admin panel' : step === 'studentLogin' ? 'Sign in as Student' : `Sign in to ${panel === 'cashier' ? 'Cashier' : 'PAMO Admin'}`
  const advance = () => {
    setError('')
    try {
      if (step === 'account') {
        if (account === 'admin') setStep('panel')
        else if (host !== 'student' || studentAuthenticated) onStudent()
        else setStep('studentLogin')
      } else if (host === 'admin') setStep('adminLogin')
      else onAdmin(panel)
    } catch (error) { const message = errorMessage(error); setError(message); onError(message) }
  }
  const authenticate = async (credentials, register) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { await onAuthenticate(credentials, { register, panel }) }
    catch (error) { const message = errorMessage(error); setError(message); onError(message) }
    finally { pending.current = false; setBusy(false) }
  }
  const goBack = () => {
    setError('')
    if (register) setRegister(false)
    else setStep(step === 'adminLogin' ? 'panel' : 'account')
  }
  const credentialsStep = step === 'studentLogin' || step === 'adminLogin'
  const stage = step === 'studentLogin' ? register ? 'register' : 'student' : step === 'adminLogin' ? panel : step
  return <section className={'shared-login login-stage-' + stage}>
    <header className='login-header'><div className='login-theme'>{themeToggle}</div></header>
    <div className='login-shell'>
      <Welcome stage={stage} />
      <div className={'login-card' + (register ? ' is-registering' : '')}>
        <div className='login-brand'><img src={logo} alt='PAMO' width='69' height='69' /><p>PAMO</p><p>School essentials · SmartStock</p><span aria-hidden='true' /></div>
        {credentialsStep ? <CredentialForm key={step + panel} student={step === 'studentLogin'} register={register} onRegister={setRegister} onBack={goBack} title={step === 'studentLogin' ? 'Sign in as Student' : `Sign in as ${panel === 'cashier' ? 'Cashier' : 'PAMO Admin'}`} heading={title} headingRef={headingRef} busy={busy} onSubmit={authenticate} error={error} clearError={() => setError('')} /> : <>
          <LoginHeading title={title} description={step === 'account' ? 'Select how you want to access PAMO.' : 'Select the staff workspace you need.'} headingRef={headingRef} />
          <LoginError message={error} />
          {step === 'panel' && <BackButton label='Change account type' onBack={goBack} />}
          <Choices kind={step === 'account' ? 'account' : 'panel'} selected={step === 'account' ? account : panel} onSelect={value => { setError(''); if (step === 'account') setAccount(value); else setPanel(value) }} />
          <button type='button' onClick={advance} className='login-primary'>{step === 'panel' ? `Continue to ${panel === 'cashier' ? 'Cashier' : 'PAMO Admin'}` : 'Continue'}<ArrowRight size={16} aria-hidden='true' /></button>
          {step === 'account' && <p className='login-choice-note'>You can return and change your account type.</p>}
        </>}
      </div>
      <div className='login-photo'>
        {/* Match LoginFlow.css: mobile cap, tablet's 315:419 columns, desktop cap. */}
        <img
          src={students}
          srcSet={`${studentsSmall} 393w, ${studentsMedium} 655w, ${students} 1310w`}
          sizes='(min-width: 1180px) clamp(300px, 28vw, 560px), (min-width: 768px) min(clamp(300px, 28vw, 560px), calc((100vw - 88px) * 315 / 734)), min(320px, calc(100vw - 32px))'
          alt='Students in school uniforms with a guitar, basketball, laptop, and camera'
          width='1310'
          height='1200'
          className='login-students'
        />
      </div>
    </div>
    {credentialsStep && <p className='login-mobile-support'>{register ? 'Registration is available for students only.' : step === 'studentLogin' ? 'Access issues? Contact campus support.' : 'Staff access trouble? Contact your administrator.'}</p>}
  </section>
}

export default LoginFlow
