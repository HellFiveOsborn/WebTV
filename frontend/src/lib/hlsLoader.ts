const HLSJS_VERSION = '1.5.13'
const HLSJS_URL = `https://cdn.jsdelivr.net/npm/hls.js@${HLSJS_VERSION}/dist/hls.min.js`

let hlsPromise: Promise<any> | null = null

export function loadHls(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).Hls) {
    return Promise.resolve((window as any).Hls)
  }
  if (hlsPromise) return hlsPromise

  hlsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = HLSJS_URL
    script.async = true
    script.onload = () => {
      if ((window as any).Hls) {
        resolve((window as any).Hls)
      } else {
        reject(new Error('Hls undefined after script load'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load hls.js'))
    document.head.appendChild(script)
  })

  return hlsPromise
}

export function __resetHlsLoaderForTests(): void {
  hlsPromise = null
}
