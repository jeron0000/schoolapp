export const ANNOUNCEMENT_READ_EVENT = 'pamo:announcement-read'
const STORAGE_PREFIX = 'pamo:read-announcements:'

export const announcementStorageKey = userId => {
  if (!userId) return ''
  return `${STORAGE_PREFIX}${userId}`
}

const browserStorage = () => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export const readAnnouncementIds = (userId, storage = browserStorage()) => {
  const key = announcementStorageKey(userId)
  if (!key || !storage) return new Set()
  try {
    const stored = JSON.parse(storage.getItem(key) || '[]')
    if (!Array.isArray(stored)) return new Set()
    return new Set(stored.filter(id => typeof id === 'string' && id))
  } catch {
    return new Set()
  }
}

export const markAnnouncementRead = (
  userId,
  announcementId,
  storage = browserStorage(),
) => {
  const key = announcementStorageKey(userId)
  if (!key || !announcementId || !storage) return false
  const readIds = readAnnouncementIds(userId, storage)
  if (readIds.has(announcementId)) return false
  readIds.add(announcementId)
  try {
    storage.setItem(key, JSON.stringify([...readIds]))
  } catch {
    return false
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_READ_EVENT, {
      detail: { userId, announcementId },
    }))
  }
  return true
}

export const unreadAnnouncementCount = (announcements, readIds) => {
  return announcements.reduce((count, announcement) => {
    if (!announcement?._id || readIds.has(announcement._id)) return count
    return count + 1
  }, 0)
}
