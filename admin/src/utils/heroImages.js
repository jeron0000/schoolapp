import axios from 'axios'
import { backendUrl } from '../utils/config'

const request = async (method, path, token, data, signal) => {
  const heroUrl = backendUrl + '/api/hero'
  const response = await axios({ method, url: heroUrl + path, headers: { token }, data, signal })
  // Existing Admin authorization can return HTTP 200 with success: false.
  if (!response.data.success) throw new Error(response.data.message || 'Unable to manage hero images. Sign in again or retry.')
  return response.data
}

export const heroErrorMessage = error => error.response?.data?.message || error.message || 'Unable to manage hero images. Please retry.'

export const fetchHeroImages = async (token, signal) => {
  const data = await request('get', '/admin/list', token, undefined, signal)
  if (!Array.isArray(data.slides)) throw new Error('Unable to read the managed hero image list. Please retry.')
  return { slides: data.slides, fallback: data.fallback || null }
}

export const createHeroImage = (token, { image, altText, isActive }) => {
  const data = new FormData()
  data.append('image', image)
  data.append('altText', altText)
  data.append('isActive', String(isActive))
  return request('post', '/add', token, data)
}

export const updateHeroImage = (token, id, metadata) => request('patch', '/' + id, token, metadata)
export const reorderHeroImages = (token, orderedIds) => request('patch', '/reorder', token, { orderedIds })
export const setDefaultHeroImage = (token, id) => request('patch', '/' + id + '/default', token)
export const deleteHeroImage = (token, id) => request('delete', '/' + id, token)
export const replaceFallbackHeroImage = (token, { image, altText }) => {
  const data = new FormData()
  data.append('image', image)
  data.append('altText', altText)
  return request('put', '/fallback', token, data)
}
export const resetFallbackHeroImage = token => request('delete', '/fallback', token)
