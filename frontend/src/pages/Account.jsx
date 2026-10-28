import { useContext, useEffect, useState } from 'react';
import { GraduationCap, UserRound } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  getAcademicProgramName,
  getAcademicProgramOptions,
} from '../../../shared/productTaxonomy.js';
import { ShopContext } from '../context/shopContext.js';

const fieldClassName = [
  'mt-2 min-h-12 w-full rounded-lg border border-[color:var(--pamo-color-border-input)]',
  'bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-base text-[color:var(--pamo-color-text-primary)]',
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--pamo-color-focus)] disabled:cursor-not-allowed disabled:opacity-70'
].join(' ');
const nativeSelectClassName = [
  fieldClassName,
  'appearance-auto pl-10 [color-scheme:light] dark:[color-scheme:dark]',
  '[&>option]:bg-[var(--pamo-color-surface-default)] [&>option]:text-[color:var(--pamo-color-text-primary)]'
].join(' ');

const Account = () => {
  const {
    studentProfile,
    profileLoading,
    profileError,
    updateAcademicProgram,
    productCategories = [],
    categoriesLoading = false,
    categoryError = '',
    getProductCategories,
  } = useContext(ShopContext);
  const [academicProgram, setAcademicProgram] = useState('');
  const [saving, setSaving] = useState(false);
  const programOptions = getAcademicProgramOptions(productCategories);
  const currentProgramIsListed = programOptions.some(option => (
    option.value === studentProfile?.academicProgram
  ));
  if (studentProfile?.academicProgram && !currentProgramIsListed) {
    const currentProgramName = getAcademicProgramName(
      productCategories,
      studentProfile.academicProgram,
    );
    programOptions.push({
      value: studentProfile.academicProgram,
      label: `${currentProgramName} (currently assigned)`,
    });
  }

  useEffect(() => {
    setAcademicProgram(studentProfile?.academicProgram || '');
  }, [studentProfile]);

  const saveProfile = async event => {
    event.preventDefault();
    if (!programOptions.some(option => option.value === academicProgram)) {
      toast.error('Please select a valid academic program.');
      return;
    }
    if (academicProgram === studentProfile?.academicProgram) {
      toast.info('Your academic program is already up to date.');
      return;
    }

    setSaving(true);
    try {
      await updateAcademicProgram(academicProgram);
      toast.success('Academic program updated.');
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Unable to update your profile.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12'>
      <header className='border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
        <p className='text-xs font-semibold uppercase tracking-wide text-[color:var(--pamo-color-accent-text)]'>Student account</p>
        <h1 className='mt-2 text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-tight text-[color:var(--pamo-color-text-primary)]'>My profile</h1>
        <p className='mt-2 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>Review your account details and keep your academic program current.</p>
      </header>

      <div className='mt-8 rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 sm:p-6'>
        <div className='flex items-center gap-3 border-b border-[color:var(--pamo-color-border-default)] pb-4'>
          <span className='grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)]'>
            <UserRound size={22} aria-hidden='true' />
          </span>
          <div className='min-w-0'>
            <h2 className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Account information</h2>
            <p className='mt-1 text-sm text-[color:var(--pamo-color-text-secondary)]'>Name and email are shown from your authenticated account.</p>
          </div>
        </div>

        {profileLoading && (
          <p role='status' className='py-8 text-sm text-[color:var(--pamo-color-text-secondary)]'>Loading your profile…</p>
        )}
        {!profileLoading && profileError && (
          <p role='alert' className='mt-5 rounded-lg border border-[color:var(--pamo-color-error)] bg-[var(--pamo-color-error-surface)] p-3 text-sm text-[color:var(--pamo-color-error-text)]'>{profileError}</p>
        )}
        {!profileLoading && studentProfile && (
          <form onSubmit={saveProfile} className='mt-5 grid gap-5'>
            <div className='grid gap-5 sm:grid-cols-2'>
              <label className='text-sm font-medium text-[color:var(--pamo-color-text-secondary)]'>
                Name
                <input className={fieldClassName} value={studentProfile.name || ''} disabled />
              </label>
              <label className='text-sm font-medium text-[color:var(--pamo-color-text-secondary)]'>
                Email address
                <input className={fieldClassName} value={studentProfile.email || ''} disabled />
              </label>
            </div>
            <label className='text-sm font-medium text-[color:var(--pamo-color-text-secondary)]'>
              Academic program
              <span className='relative block'>
                <GraduationCap className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' size={18} aria-hidden='true' />
                <select
                  className={nativeSelectClassName}
                  required
                  value={academicProgram}
                  disabled={saving}
                  onChange={event => setAcademicProgram(event.target.value)}
                >
                  <option value='' disabled>Select your program</option>
                  {programOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </span>
              {categoriesLoading && (
                <span role='status' className='mt-2 block text-xs text-[color:var(--pamo-color-text-secondary)]'>Loading the latest programs...</span>
              )}
              {categoryError && (
                <span role='alert' className='mt-2 block text-xs text-[color:var(--pamo-color-error-text)]'>
                  New program options are unavailable.{' '}
                  <button type='button' className='min-h-11 font-semibold underline underline-offset-4' onClick={getProductCategories}>Try again</button>
                </span>
              )}
            </label>
            {!studentProfile.academicProgram && (
              <p className='rounded-lg border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] p-3 text-sm text-[color:var(--pamo-color-text-secondary)]'>Add your academic program to keep your student profile complete.</p>
            )}
            <button type='submit' disabled={saving} className='min-h-12 rounded-lg bg-[var(--pamo-color-brand-yellow)] px-5 py-3 font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)] disabled:cursor-not-allowed disabled:opacity-60 sm:justify-self-start'>
              {saving ? 'Saving…' : 'Save academic program'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
};

export default Account;
