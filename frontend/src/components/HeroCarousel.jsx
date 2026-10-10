import { useContext, useEffect, useId, useRef, useState } from 'react'
import { ShopContext } from '../context/shopContext'
import { assets } from '../assets/assets'
import useHeroSlides from '../hooks/useHeroSlides'
import './HeroCarousel.css'

const fallbackSlide = {
  imageUrl: assets.hero_img,
  altText: 'STI students in campus uniforms gathered behind large yellow STI letters'
}

const HeroCarousel = () => {
  const { backendUrl } = useContext(ShopContext)
  const { slides: managedSlides, discardImage } = useHeroSlides(backendUrl)
  const slides = managedSlides.length ? managedSlides : [fallbackSlide]
  const count = slides.length
  const multiple = count > 1
  // previousIndex exists only for the outgoing animation, never as selection state.
  const [navigation, setNavigation] = useState({ index: 0, previousIndex: null, direction: 1, sequence: 0 })
  const [autoplayPaused, setAutoplayPaused] = useState(false)
  const [interaction, setInteraction] = useState({ hover: false, focus: false, pointer: false })
  const [environment, setEnvironment] = useState(() => ({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden
  }))
  const gesture = useRef(null)
  const pagination = useRef(null)
  const navigationHelpId = useId()
  const currentIndex = navigation.index % count
  const currentSlide = slides[currentIndex]
  const outgoingSlide = navigation.previousIndex === null ? null : slides[navigation.previousIndex]
  const autoplayEnabled = multiple && !autoplayPaused && !environment.reducedMotion
  const canAutoplay = autoplayEnabled && !environment.hidden
    && !interaction.hover && !interaction.focus && !interaction.pointer

  useEffect(() => {
    const viewport = pagination.current
    if (!viewport) return
    const keepActiveDotVisible = () => {
      const activeDot = viewport.children[currentIndex]
      if (!activeDot || viewport.scrollWidth <= viewport.clientWidth) return
      // Keep the current dot visible without scrolling the page, including after a resize.
      if (activeDot.offsetLeft < viewport.scrollLeft || activeDot.offsetLeft + activeDot.offsetWidth > viewport.scrollLeft + viewport.clientWidth) {
        viewport.scrollLeft = activeDot.offsetLeft - (viewport.clientWidth - activeDot.offsetWidth) / 2
      }
    }
    keepActiveDotVisible()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(keepActiveDotVisible)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [currentIndex, count])

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionChange = event => {
      setEnvironment(current => ({ ...current, reducedMotion: event.matches }))
      if (event.matches) setNavigation(current => ({ ...current, previousIndex: null }))
    }
    const onVisibilityChange = () => setEnvironment(current => ({ ...current, hidden: document.hidden }))
    motion.addEventListener('change', onMotionChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      motion.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!canAutoplay) return
    const timer = window.setTimeout(() => {
      setNavigation(current => ({
        index: (current.index + 1) % count,
        previousIndex: current.index % count,
        direction: 1,
        sequence: current.sequence + 1
      }))
    }, 7000)
    return () => window.clearTimeout(timer)
  }, [canAutoplay, count, navigation.sequence])

  const navigate = (index, direction) => {
    if (!multiple) return
    setAutoplayPaused(true)
    setNavigation(current => {
      const previousIndex = current.index % count
      const nextIndex = (index + count) % count
      return {
        index: nextIndex,
        previousIndex: nextIndex === previousIndex || environment.reducedMotion ? null : previousIndex,
        direction,
        sequence: current.sequence + 1
      }
    })
  }

  const onImageError = imageUrl => {
    const remaining = slides.filter(slide => slide.imageUrl !== imageUrl)
    const index = Math.max(0, remaining.findIndex(slide => slide.imageUrl === currentSlide.imageUrl))
    discardImage(imageUrl)
    setNavigation(current => ({ index, previousIndex: null, direction: 1, sequence: current.sequence + 1 }))
  }

  const setInteractionState = (name, value) => setInteraction(current =>
    current[name] === value ? current : { ...current, [name]: value }
  )
  const endGesture = () => {
    gesture.current = null
    setInteractionState('pointer', false)
  }
  const onPointerDown = event => {
    if (!multiple || !event.isPrimary || event.button !== 0 || event.target.closest('button')) return
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setInteractionState('pointer', true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = event => {
    const start = gesture.current
    if (!start || start.pointerId !== event.pointerId) return
    const horizontal = Math.abs(event.clientX - start.x)
    const vertical = Math.abs(event.clientY - start.y)
    if (vertical > 12 && vertical >= horizontal) endGesture()
  }
  const onPointerUp = event => {
    const start = gesture.current
    endGesture()
    if (!start || start.pointerId !== event.pointerId) return
    const horizontal = event.clientX - start.x
    const vertical = Math.abs(event.clientY - start.y)
    if (Math.abs(horizontal) >= 48 && Math.abs(horizontal) > vertical * 1.5) {
      const direction = horizontal < 0 ? 1 : -1
      navigate(currentIndex + direction, direction)
    }
  }

  const nextIndex = (currentIndex + 1) % count
  const animate = multiple && outgoingSlide && !environment.reducedMotion

  return (
    <div className='hero-carousel absolute inset-0 overflow-hidden touch-pan-y [touch-action:pan-y_pinch-zoom]'
      role={multiple ? 'region' : undefined} aria-roledescription={multiple ? 'carousel' : undefined}
      aria-label={multiple ? 'Campus essentials images' : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setInteractionState('hover', true) }}
      onPointerLeave={() => setInteractionState('hover', false)}
      onFocusCapture={() => setInteractionState('focus', true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteractionState('focus', false) }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={endGesture} onLostPointerCapture={endGesture}>
      {animate && (
        <img key={'outgoing-' + navigation.sequence} src={outgoingSlide.imageUrl} alt='' aria-hidden='true'
          className='hero-carousel-image hero-carousel-outgoing' style={{ '--hero-direction': navigation.direction }}
          draggable='false' decoding='async' />
      )}
      <div key={navigation.sequence} className={'absolute inset-0' + (animate ? ' hero-carousel-incoming' : '')}
        style={{ '--hero-direction': navigation.direction }} role={multiple ? 'group' : undefined}
        aria-roledescription={multiple ? 'slide' : undefined} aria-label={multiple ? `${currentIndex + 1} of ${count}` : undefined}
        onAnimationEnd={() => setNavigation(current => ({ ...current, previousIndex: null }))}>
        <img className='hero-carousel-image' src={currentSlide.imageUrl} alt={currentSlide.altText}
          width='2412' height='1752' loading='eager' fetchPriority={navigation.sequence === 0 ? 'high' : 'auto'}
          decoding='async' draggable='false' onError={managedSlides.length ? () => onImageError(currentSlide.imageUrl) : undefined} />
      </div>
      {multiple && nextIndex !== navigation.previousIndex && (
        <img className='hidden' src={slides[nextIndex].imageUrl} alt='' aria-hidden='true' loading='eager'
          fetchPriority='low' decoding='async' onError={() => onImageError(slides[nextIndex].imageUrl)} />
      )}
      {multiple && (
        <>
          <div className={'hero-carousel-pagination-layout' + (!environment.reducedMotion ? ' hero-carousel-pagination-with-rotation' : '')}>
            {!environment.reducedMotion && (
              <button type='button' className='hero-carousel-rotation' aria-label={autoplayPaused ? 'Resume hero carousel' : 'Pause hero carousel'}
                onClick={() => setAutoplayPaused(current => !current)}>
                <span className='hero-carousel-rotation-label'>{autoplayPaused ? 'Resume' : 'Pause'}</span>
              </button>
            )}
            <div ref={pagination} className='hero-carousel-pagination' role='group' aria-label='Choose a hero image'>
              {slides.map((slide, index) => (
                <button type='button' key={slide._id || slide.imageUrl} className='hero-carousel-dot-button' aria-label={`Go to hero image ${index + 1} of ${count}`} aria-describedby={navigationHelpId}
                  aria-current={index === currentIndex ? 'true' : undefined} onClick={() => navigate(index, index >= currentIndex ? 1 : -1)}>
                  <span aria-hidden='true' className='hero-carousel-dot' />
                </button>
              ))}
            </div>
          </div>
          <button type='button' className='hero-carousel-button hero-carousel-arrow hero-carousel-previous' aria-label='Previous hero image' aria-describedby={navigationHelpId} onClick={() => navigate(currentIndex - 1, -1)}>
            <svg aria-hidden='true' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8' className='h-4 w-4'><path d='m10 3-5 5 5 5'/></svg>
          </button>
          <button type='button' className='hero-carousel-button hero-carousel-arrow hero-carousel-next' aria-label='Next hero image' aria-describedby={navigationHelpId} onClick={() => navigate(currentIndex + 1, 1)}>
            <svg aria-hidden='true' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8' className='h-4 w-4'><path d='m6 3 5 5-5 5'/></svg>
          </button>
          <p id={navigationHelpId} className='sr-only'>{environment.reducedMotion ? 'Automatic rotation is disabled for reduced motion.' : 'Selecting an image or swiping pauses rotation. Choose Resume to restart.'}</p>
          <p className='sr-only' aria-live={canAutoplay ? 'off' : 'polite'} aria-atomic='true'>Hero image {currentIndex + 1} of {count}</p>
        </>
      )}
    </div>
  )
}

export default HeroCarousel
