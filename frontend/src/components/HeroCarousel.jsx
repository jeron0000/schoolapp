import { useContext, useEffect, useId, useRef, useState } from 'react'
import { ShopContext } from '../context/shopContext.js'
import { assets } from '../assets/assets'
import useHeroSlides from '../hooks/useHeroSlides'
import './HeroCarousel.css'

const fallbackSlide = {
  imageUrl: assets.hero_img,
  altText: 'STI students in campus uniforms gathered behind large yellow STI letters'
}

const carouselImageClass = 'absolute inset-0 h-full w-full object-cover object-center min-[960px]:object-top'
const carouselFrameClass = 'absolute inset-0'

const HeroCarousel = () => {
  const { backendUrl } = useContext(ShopContext)
  const { slides: managedSlides, fallback, discardImage } = useHeroSlides(backendUrl)
  const slides = managedSlides.length ? managedSlides : [fallback || fallbackSlide]
  const count = slides.length
  const multiple = count > 1
  // previousIndex exists only for the outgoing animation, never as selection state.
  const [navigation, setNavigation] = useState({ index: 0, previousIndex: null, direction: 1, sequence: 0, announce: false })
  const [interaction, setInteraction] = useState({ hover: false, focus: false, pointer: false })
  const [environment, setEnvironment] = useState(() => ({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden
  }))
  const gesture = useRef(null)
  const lastPointerType = useRef('')
  const suppressClick = useRef(false)
  const navigationHelpId = useId()
  const currentIndex = navigation.index % count
  const currentSlide = slides[currentIndex]
  const outgoingSlide = navigation.previousIndex === null ? null : slides[navigation.previousIndex]
  const autoplayEnabled = multiple && !environment.reducedMotion
  const canAutoplay = autoplayEnabled && !environment.hidden
    && !interaction.hover && !interaction.focus && !interaction.pointer
  const carouselRole = multiple ? 'region' : undefined
  const carouselDescription = multiple ? 'carousel' : undefined
  const carouselLabel = multiple ? 'Campus essentials images' : undefined

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionChange = event => {
      setEnvironment(current => ({ ...current, reducedMotion: event.matches }))
      if (event.matches) {
        setNavigation(current => ({ ...current, previousIndex: null }))
      }
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
    if (!canAutoplay) {
      return
    }
    const timer = window.setTimeout(() => {
      setNavigation(current => ({
        index: (current.index + 1) % count,
        previousIndex: current.index % count,
        direction: 1,
        sequence: current.sequence + 1,
        announce: false
      }))
    }, 7000)
    return () => window.clearTimeout(timer)
  }, [canAutoplay, count, navigation.sequence])

  const navigate = (index, direction) => {
    if (!multiple) {
      return
    }
    setNavigation(current => {
      const previousIndex = current.index % count
      const nextIndex = (index + count) % count
      return {
        index: nextIndex,
        previousIndex: nextIndex === previousIndex || environment.reducedMotion ? null : previousIndex,
        direction,
        sequence: current.sequence + 1,
        announce: true
      }
    })
  }

  const onImageError = imageUrl => {
    const remaining = slides.filter(slide => slide.imageUrl !== imageUrl)
    const index = Math.max(0, remaining.findIndex(slide => slide.imageUrl === currentSlide.imageUrl))
    discardImage(imageUrl)
    setNavigation(current => ({ index, previousIndex: null, direction: 1, sequence: current.sequence + 1, announce: false }))
  }

  const setInteractionState = (name, value) => {
    setInteraction(current => {
      if (current[name] === value) {
        return current
      }
      return { ...current, [name]: value }
    })
  }
  const endGesture = () => {
    gesture.current = null
    setInteractionState('pointer', false)
  }
  const onPointerDown = event => {
    lastPointerType.current = event.pointerType
    suppressClick.current = false
    if (!multiple || event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) {
      return
    }
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setInteractionState('pointer', true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = event => {
    const start = gesture.current
    if (!start || start.pointerId !== event.pointerId) {
      return
    }
    const horizontal = Math.abs(event.clientX - start.x)
    const vertical = Math.abs(event.clientY - start.y)
    if (vertical > 12 && vertical >= horizontal) {
      endGesture()
    }
  }
  const onPointerUp = event => {
    const start = gesture.current
    endGesture()
    if (!start || start.pointerId !== event.pointerId) {
      return
    }
    const horizontal = event.clientX - start.x
    const vertical = Math.abs(event.clientY - start.y)
    if (Math.abs(horizontal) >= 48 && Math.abs(horizontal) > vertical * 1.5) {
      const direction = horizontal < 0 ? 1 : -1
      suppressClick.current = true
      navigate(currentIndex + direction, direction)
    }
  }

  const navigateFromHitRegion = direction => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (lastPointerType.current && lastPointerType.current !== 'mouse') {
      return
    }
    navigate(currentIndex + direction, direction)
  }

  const handleKeyDown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    navigate(currentIndex + direction, direction)
  }

  const nextIndex = (currentIndex + 1) % count
  const animate = multiple && outgoingSlide && !environment.reducedMotion
  const incomingClass = animate ? `${carouselFrameClass} hero-carousel-incoming` : carouselFrameClass
  const navigationHelp = environment.reducedMotion
    ? 'Automatic rotation is disabled for reduced motion.'
    : 'Use Left and Right arrow keys, click either side, or swipe horizontally to change images.'

  const handlePointerEnter = event => {
    if (event.pointerType === 'mouse') {
      setInteractionState('hover', true)
    }
  }
  const handleBlur = event => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setInteractionState('focus', false)
    }
  }
  const handleAnimationEnd = () => {
    setNavigation(current => ({ ...current, previousIndex: null }))
  }

  return (
    <div
      className='hero-carousel group absolute inset-0 overflow-hidden touch-pan-y [touch-action:pan-y_pinch-zoom] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white'
      role={carouselRole}
      aria-roledescription={carouselDescription}
      aria-label={carouselLabel}
      aria-describedby={multiple ? navigationHelpId : undefined}
      tabIndex={multiple ? 0 : undefined}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={() => setInteractionState('hover', false)}
      onFocusCapture={() => setInteractionState('focus', true)}
      onBlurCapture={handleBlur}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      onKeyDown={handleKeyDown}
    >
      {animate && (
        <img
          key={'outgoing-' + navigation.sequence}
          src={outgoingSlide.imageUrl}
          alt=''
          aria-hidden='true'
          className={`${carouselImageClass} hero-carousel-outgoing`}
          style={{ '--hero-direction': navigation.direction }}
          draggable='false'
          decoding='async'
        />
      )}
      <div
        key={navigation.sequence}
        className={incomingClass}
        style={{ '--hero-direction': navigation.direction }}
        role={multiple ? 'group' : undefined}
        aria-roledescription={multiple ? 'slide' : undefined}
        aria-label={multiple ? `${currentIndex + 1} of ${count}` : undefined}
        onAnimationEnd={handleAnimationEnd}
      >
        <img
          className={carouselImageClass}
          src={currentSlide.imageUrl}
          alt={currentSlide.altText}
          width='2412'
          height='1752'
          loading='eager'
          fetchPriority={navigation.sequence === 0 ? 'high' : 'auto'}
          decoding='async'
          draggable='false'
          onError={managedSlides.length || fallback ? () => onImageError(currentSlide.imageUrl) : undefined}
        />
      </div>
      {multiple && nextIndex !== navigation.previousIndex && (
        <img
          className='hidden'
          src={slides[nextIndex].imageUrl}
          alt=''
          aria-hidden='true'
          loading='eager'
          fetchPriority='low'
          decoding='async'
          onError={() => onImageError(slides[nextIndex].imageUrl)}
        />
      )}
      {multiple && (
        <>
          <span
            className='absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer'
            aria-hidden='true'
            data-carousel-hit-region='previous'
            onClick={() => navigateFromHitRegion(-1)}
          />
          <span
            className='absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer'
            aria-hidden='true'
            data-carousel-hit-region='next'
            onClick={() => navigateFromHitRegion(1)}
          />
          <p id={navigationHelpId} className='sr-only'>{navigationHelp}</p>
          <p className='sr-only' aria-live={navigation.announce ? 'polite' : 'off'} aria-atomic='true'>
            Hero image {currentIndex + 1} of {count}
          </p>
        </>
      )}
    </div>
  )
}

export default HeroCarousel
