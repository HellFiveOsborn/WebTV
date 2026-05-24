import { DomainGroup } from '../../../types/script'

interface DomainSelectorProps {
  domainGroups: DomainGroup[]
  selectedDomain: string
  selectedSubdomains: string[]
  onDomainChange: (domain: string) => void
  onSubdomainsChange: (subdomains: string[]) => void
}

export const DomainSelector = ({
  domainGroups,
  selectedDomain,
  selectedSubdomains,
  onDomainChange,
  onSubdomainsChange
}: DomainSelectorProps) => {
  const currentGroup = domainGroups.find(g => g.domain === selectedDomain)

  const toggleSubdomain = (sub: string) => {
    if (selectedSubdomains.includes(sub)) {
      onSubdomainsChange(selectedSubdomains.filter(s => s !== sub))
    } else {
      onSubdomainsChange([...selectedSubdomains, sub])
    }
  }

  const filteredUrls = currentGroup?.urls.filter(url => {
    if (selectedSubdomains.length === 0) return true
    return selectedSubdomains.some(sub => url.includes(`://${sub}.`))
  }) || []

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-gray-400 text-sm mb-2">Domínio Base</label>
        <select
          value={selectedDomain}
          onChange={(e) => {
            onDomainChange(e.target.value)
            onSubdomainsChange([])
          }}
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white"
        >
          <option value="">Selecionar domínio...</option>
          {domainGroups.map(group => (
            <option key={group.domain} value={group.domain}>
              {group.domain} ({group.urls.length} URLs)
            </option>
          ))}
        </select>
      </div>

      {currentGroup && currentGroup.subdomains.length > 0 && (
        <div>
          <label className="block text-gray-400 text-sm mb-2">Subdomínios</label>
          <div className="flex flex-wrap gap-2">
            {currentGroup.subdomains.map(sub => (
              <button
                key={sub}
                type="button"
                onClick={() => toggleSubdomain(sub)}
                className={`px-3 py-1 rounded-full text-sm transition-all ${
                  selectedSubdomains.includes(sub)
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-border text-gray-400 hover:text-white'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentGroup && (
        <div>
          <label className="block text-gray-400 text-sm mb-2">
            URLs ({filteredUrls.length})
          </label>
          <div className="max-h-32 overflow-y-auto space-y-1 bg-dark-bg rounded-lg p-2">
            {filteredUrls.map(url => (
              <div key={url} className="text-xs text-gray-500 font-mono truncate">
                {url}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
