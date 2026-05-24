export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return days === 1 ? '1 dia atrás' : `${days} dias atrás`
  }
  if (hours > 0) {
    return hours === 1 ? '1 hora atrás' : `${hours} horas atrás`
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minuto atrás' : `${minutes} minutos atrás`
  }
  return 'agora mesmo'
}
