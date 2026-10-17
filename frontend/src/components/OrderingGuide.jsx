import HomeSectionHeading from './HomeSectionHeading'

const steps = [
  {
    title: 'Find the right fit',
    tablet: 'Browse essentials',
    mobile: 'Find your product',
    copy: 'Review available sizes and stock.',
    smallCopy: 'Browse the catalog and choose a size.'
  },
  {
    title: 'Checkout with confidence',
    tablet: 'Choose size & order',
    mobile: 'Place your order',
    copy: 'Use an existing supported payment method.',
    smallCopy: 'Submit your order using an available payment method.'
  },
  {
    title: 'Know what comes next',
    tablet: 'Track & claim',
    mobile: 'Track and claim',
    copy: 'Track your order from placement to claiming.',
    smallCopy: 'Follow its status until ready to claim.'
  }
]

const OrderingGuide = () => (
  <section className='home-ordering-guide' aria-labelledby='ordering-guide-heading'>
    <HomeSectionHeading
      id='ordering-guide-heading'
      eyebrow='How ordering works'
      title={
        <>
          <span className='home-copy-desktop'>Ordering your essentials is straightforward</span>
          <span className='home-copy-tablet'>From finding your fit to claiming</span>
          <span className='home-copy-mobile'>Simple from start to finish</span>
        </>
      }
      description={
        <span className='home-copy-desktop'>
          Find your product, select a size, and follow its status until claiming.
        </span>
      }
    />
    <ol className='home-ordering-steps'>
      {steps.map(({ title, tablet, mobile, copy, smallCopy }, index) => (
        <li key={title}>
          <span className='home-step-number' aria-hidden='true'>
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h3>
              <span className='home-copy-desktop'>{title}</span>
              <span className='home-copy-tablet'>{tablet}</span>
              <span className='home-copy-mobile'>{mobile}</span>
            </h3>
            <p>
              <span className='home-copy-desktop'>{copy}</span>
              <span className='home-copy-nondesktop'>{smallCopy}</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  </section>
)

export default OrderingGuide
