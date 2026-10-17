const HomeSectionHeading = ({ id, eyebrow, title, description, action }) => (
  <header className='home-section-heading'>
    <div className='home-section-intro'>
      <p className='home-eyebrow'>{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {description && <p className='home-section-description'>{description}</p>}
    </div>
    {action}
  </header>
)

export default HomeSectionHeading
