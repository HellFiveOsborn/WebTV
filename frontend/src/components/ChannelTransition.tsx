import { Channel } from '../types/channel'

interface ChannelTransitionProps {
  channel: Channel
}

export const ChannelTransition = ({ channel }: ChannelTransitionProps) => (
  <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-4">
    <div className="text-center space-y-6">
      <div className="mx-auto w-32 h-32 sm:w-40 sm:h-40 bg-dark-surface border-2 border-dark-border rounded-2xl overflow-hidden flex items-center justify-center">
        <img
          src={channel.logoUrl}
          alt={channel.title}
          className="w-full h-full object-contain"
          onError={(e) => {
            e.currentTarget.src = `https://placehold.co/300x200/1e1e1e/3b82f6?text=${encodeURIComponent(channel.title)}`
          }}
        />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-white">{channel.title}</h1>

      <div className="flex items-center justify-center gap-3 mt-8">
        <div className="w-6 h-6 border-2 border-dark-border border-t-primary rounded-full animate-spin" />
        <p className="text-gray-400 text-base sm:text-lg">Abrindo canal...</p>
      </div>
    </div>
  </div>
)