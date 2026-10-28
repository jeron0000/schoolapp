import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const validSlide = slide => {
  if (typeof slide?.imageUrl !== 'string' || typeof slide.altText !== 'string' || !slide.altText.trim()) return false
  try {
    const url = new URL(slide.imageUrl)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const readImages = data => {
  if (data?.success !== true || !Array.isArray(data.slides)) return { slides: [], fallback: null }
  return { slides: data.slides.filter(validSlide), fallback: validSlide(data.fallback) ? data.fallback : null }
}

const useHeroSlides = backendUrl => {
  const [result, setResult] = useState({ backendUrl, slides: [], fallback: null })
  const request = useRef(null)

  useEffect(() => {
    let subscribed = true
    // Share the mount request across effect replays; rerenders never refetch.
    if (!request.current || request.current.backendUrl !== backendUrl) {
      request.current = {
        backendUrl,
        promise: axios.get(backendUrl + '/api/hero/list', { timeout: 10000 })
          .then(response => readImages(response.data))
          .catch(() => ({ slides: [], fallback: null }))
      }
    }
    request.current.promise.then(images => {
      if (subscribed) setResult({ backendUrl, ...images })
    })
    return () => { subscribed = false }
  }, [backendUrl])

  const discardImage = imageUrl => setResult(current => ({
    ...current,
    slides: current.slides.filter(slide => slide.imageUrl !== imageUrl),
    fallback: current.fallback?.imageUrl === imageUrl ? null : current.fallback
  }))

  return {
    slides: result.backendUrl === backendUrl ? result.slides : [],
    fallback: result.backendUrl === backendUrl ? result.fallback : null,
    discardImage
  }
}

export default useHeroSlides
