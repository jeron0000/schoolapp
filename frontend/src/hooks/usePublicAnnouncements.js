import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_TIMEOUT_DELAY = 2_147_000_000
const VISIBLE_REFRESH_GRACE = 1000
const backendUrl = import.meta.env.VITE_BACKEND_URL

const clearRefreshTimer = timer => {
  if (timer.current === null) return
  globalThis.clearTimeout(timer.current)
  timer.current = null
}

const scheduleRefresh = (timer, nextChangeAt, refresh) => {
  clearRefreshTimer(timer)
  const transitionTime = Date.parse(nextChangeAt)
  if (!Number.isFinite(transitionTime)) return

  const armTimer = () => {
    const remaining = transitionTime - Date.now()
    if (remaining <= 0) {
      timer.current = globalThis.setTimeout(refresh, 0)
      return
    }
    timer.current = globalThis.setTimeout(
      armTimer,
      Math.min(remaining, MAX_TIMEOUT_DELAY),
    )
  }
  armTimer()
}

const responseMessage = error => {
  return error.response?.data?.message
    || error.message
    || 'Unable to load announcements.'
}

export const usePublicAnnouncements = ({ enabled = true } = {}) => {
  const [announcements, setAnnouncements] = useState([])
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle')
  const [error, setError] = useState('')
  const active = useRef(false)
  const refreshTimer = useRef(null)
  const lastRefresh = useRef(0)
  const requestId = useRef(0)

  const loadAnnouncements = useCallback(async function refreshAnnouncements() {
    if (!enabled) return
    const currentRequest = ++requestId.current
    try {
      const { data } = await axios.get(
        backendUrl + '/api/announcement/public/list',
      )
      if (!active.current || currentRequest !== requestId.current) return
      if (!data.success || !Array.isArray(data.announcements)) {
        throw new Error(data.message || 'Unable to load announcements.')
      }
      setAnnouncements(data.announcements)
      setError('')
      setStatus('ready')
      lastRefresh.current = Date.now()
      scheduleRefresh(refreshTimer, data.nextChangeAt, refreshAnnouncements)
    } catch (failure) {
      if (!active.current || currentRequest !== requestId.current) return
      setAnnouncements([])
      setError(responseMessage(failure))
      setStatus('error')
      clearRefreshTimer(refreshTimer)
    }
  }, [enabled])

  useEffect(() => {
    active.current = true
    if (enabled) {
      setStatus('loading')
      loadAnnouncements()
    } else {
      setAnnouncements([])
      setError('')
      setStatus('idle')
    }
    return () => {
      active.current = false
      requestId.current += 1
      clearRefreshTimer(refreshTimer)
    }
  }, [enabled, loadAnnouncements])

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - lastRefresh.current < VISIBLE_REFRESH_GRACE) return
      lastRefresh.current = Date.now()
      loadAnnouncements()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [enabled, loadAnnouncements])

  const retry = () => {
    setStatus('loading')
    setError('')
    loadAnnouncements()
  }

  return { announcements, status, error, retry }
}
