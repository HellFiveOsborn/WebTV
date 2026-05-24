export const getItem = <T>(key: string): T | null => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch {
    return null
  }
}

export const setItem = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    console.error('Failed to save to localStorage')
  }
}

export const removeItem = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    console.error('Failed to remove from localStorage')
  }
}
