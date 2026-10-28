import { useCallback, useEffect, useRef, useState } from 'react'
import { createHeroImage, deleteHeroImage, fetchHeroImages, heroErrorMessage, reorderHeroImages, setDefaultHeroImage, updateHeroImage, replaceFallbackHeroImage, resetFallbackHeroImage } from '../utils/heroImages'

const useHeroImages = token => {
  const [images, setImages] = useState([])
  const [fallback, setFallback] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const pending = useRef(false)
  const reading = useRef(true)
  const controller = useRef(null)

  const load = useCallback(async () => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    reading.current = true
    try {
      const data = await fetchHeroImages(token, current.signal)
      if (!mounted.current || current.signal.aborted) return
      setImages(data.slides)
      setFallback(data.fallback)
      setError('')
      setStatus('ready')
    } catch (failure) {
      if (!mounted.current || current.signal.aborted) return
      setError(heroErrorMessage(failure))
      setStatus('error')
    } finally {
      if (controller.current === current) reading.current = false
    }
  }, [token])

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false; controller.current?.abort() }
  }, [load])

  const refresh = async () => {
    if (pending.current || reading.current) return
    setStatus('loading')
    await load()
  }

  const mutate = async (action, successMessage) => {
    if (pending.current || reading.current || status !== 'ready') return null
    pending.current = true
    setBusy(true)
    setNotice(null)
    let result
    try {
      await action()
      result = { ok: true, message: successMessage }
    } catch (failure) {
      result = { ok: false, message: heroErrorMessage(failure) }
    }
    if (mounted.current) {
      setNotice(result)
      setStatus('loading')
      // A failed deletion can already have hidden/locked the record; other
      // failures may also follow a committed write. Always reconcile the list.
      await load()
      if (mounted.current) setBusy(false)
    }
    pending.current = false
    return result
  }

  const move = (id, direction) => {
    const index = images.findIndex(image => image._id === id)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= images.length) return
    const orderedIds = images.map(image => image._id)
    const movedId = orderedIds[index]
    orderedIds[index] = orderedIds[destination]
    orderedIds[destination] = movedId
    return mutate(() => reorderHeroImages(token, orderedIds), 'Hero image order updated.')
  }

  return {
    images, fallback, status, error, notice, busy, refresh, move,
    replaceFallback: values => mutate(() => replaceFallbackHeroImage(token, values), 'Default Hero image replaced.'),
    resetFallback: () => mutate(() => resetFallbackHeroImage(token), 'Original Hero image restored.'),
    setDefault: id => mutate(() => setDefaultHeroImage(token, id), 'Default hero image updated.'),
    create: values => mutate(() => createHeroImage(token, values), 'Hero image added.'),
    update: (id, values) => mutate(() => updateHeroImage(token, id, values), 'Hero image updated.'),
    remove: id => mutate(() => deleteHeroImage(token, id), 'Hero image deleted.')
  }
}

export default useHeroImages
