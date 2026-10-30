export function consumePairingFragment(location, history) {
  if (!location.hash.startsWith('#pair=')) return null
  const key = new URLSearchParams(location.hash.slice(1)).get('pair')
  // Remove the secret before any connection is opened; do not retain it in history.
  history.replaceState(null, '', location.pathname + location.search)
  return /^[A-Za-z0-9_-]{43}$/.test(key || '') ? key : null
}
