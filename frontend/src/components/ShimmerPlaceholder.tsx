interface ShimmerPlaceholderProps {
  className?: string
  width?: string
  height?: string
  rounded?: 'full' | 'lg' | 'md' | 'sm' | 'none'
}

const roundedClasses = {
  full: 'rounded-full',
  lg: 'rounded-lg',
  md: 'rounded-md',
  sm: 'rounded-sm',
  none: 'rounded-none',
}

export function ShimmerPlaceholder({
  className = '',
  width,
  height,
  rounded = 'md',
}: ShimmerPlaceholderProps) {
  const baseClasses = `
    bg-gradient-to-r from-dark-surface via-dark-border to-dark-surface
    bg-[length:400%_100%]
    animate-shimmer
    ${roundedClasses[rounded]}
    ${className}
  `

  return (
    <div
      className={baseClasses}
      style={{ width, height }}
    />
  )
}

export function SearchBarSkeleton() {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-4 sm:pl-6 pointer-events-none">
        <ShimmerPlaceholder
          width="20px"
          height="20px"
          className="sm:w-6 sm:h-6"
          rounded="sm"
        />
      </div>
      <div className="w-full py-3 sm:py-4 pl-12 sm:pl-16 pr-4 sm:pr-6 flex items-center">
        <ShimmerPlaceholder
          width="100%"
          height="1.25rem"
          className="sm:h-[1.375rem]"
          rounded="md"
        />
      </div>
    </div>
  )
}

export function SortTabSkeleton() {
  return (
    <div className="flex gap-2">
      <ShimmerPlaceholder width="4rem" height="2rem" className="sm:w-20 sm:h-10" rounded="lg" />
      <ShimmerPlaceholder width="4rem" height="2rem" className="sm:w-20 sm:h-10" rounded="lg" />
    </div>
  )
}

export function ChannelCardSkeleton() {
  return (
    <div className="bg-dark-surface rounded-lg overflow-hidden">
      <div className="aspect-video flex items-center justify-center">
        <ShimmerPlaceholder
          width="100%"
          height="100%"
          rounded="none"
        />
      </div>
      <div className="p-3 space-y-2">
        <ShimmerPlaceholder width="70%" height="1rem" rounded="md" />
        <ShimmerPlaceholder width="50%" height="0.875rem" rounded="md" />
      </div>
    </div>
  )
}

export function ChannelGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 px-2 sm:px-4 md:px-6">
      {Array.from({ length: count }).map((_, i) => (
        <ChannelCardSkeleton key={i} />
      ))}
    </div>
  )
}
