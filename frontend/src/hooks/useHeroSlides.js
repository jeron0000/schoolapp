import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const readSlides = data => {
  if (data?.success !== true || !Array.isArray(data.slides)) return []
  return data.slides.filter(slide => {
    if (typeof slide?.imageUrl !== 'string' || typeof slide.altText !== 'string' || !slide.altText.trim()) return false
    try {
      const url = new URL(slide.imageUrl)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  })
}

const useHeroSlides = backendUrl => {
  const [result, setResult] = useState({ backendUrl, slides: [] })
  const request = useRef(null)

  useEffect(() => {
    let subscribed = true
    // Share the mount request across effect replays; rerenders never refetch.
    if (!request.current || request.current.backendUrl !== backendUrl) {
      request.current = {
        backendUrl,
        promise: axios.get(backendUrl + '/api/hero/list', { timeout: 10000 })
          .then(response => readSlides(response.data))
          .catch(() => [])
      }
    }
    request.current.promise.then(slides => {
      if (subscribed) setResult({ backendUrl, slides })
    })
    return () => { subscribed = false }
  }, [backendUrl])

  const discardImage = imageUrl => setResult(current => ({
    ...current,
    slides: current.slides.filter(slide => slide.imageUrl !== imageUrl)
  }))

  return { slides: result.backendUrl === backendUrl ? result.slides : [], discardImage }
}

export default useHeroSlides
