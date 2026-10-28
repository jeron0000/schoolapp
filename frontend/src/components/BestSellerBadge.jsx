const BestSellerBadge = ({ BestSeller, className = '' }) => {
  if (BestSeller !== true) return null

  return (
    <span className={`inline-flex max-w-full shrink-0 items-center rounded border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-brand-yellow)] px-1.5 py-0.5 text-[9px] font-semibold leading-4 tracking-[0.03em] text-slate-950 ${className}`}>
      FEATURED
    </span>
  )
}

export default BestSellerBadge
