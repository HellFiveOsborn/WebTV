import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Attempt,
  STRATEGY_LABEL,
  clearLocalCache,
  getLocalCacheStatus,
} from './lib/catalogSource'
import { loadInitialCatalog, revalidateCatalog } from './lib/catalogLoader'
import { formatAge } from './lib/catalogCache'
import { EmbedcanaisCatalog, EmbedcanaisChannel } from './lib/parseEmbedcanais'

interface CatalogState {
  catalog: EmbedcanaisCatalog
  strategy: keyof typeof STRATEGY_LABEL
  source: string
  fetchedAt: number
}

function ChannelCard({ channel }: { channel: EmbedcanaisChannel }) {
  return (
    <li className="card">
      <img
        className="logo"
        src={channel.image}
        alt={`Logo ${channel.name}`}
        loading="lazy"
        onError={e => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <div className="info">
        <div className="name">{channel.name || '(sem nome)'}</div>
        <div className="category">{channel.category}</div>
        <div className="slug">slug: {channel.slug}</div>
        <div className="url" title={channel.href}>
          {channel.href}
        </div>
      </div>
    </li>
  )
}

export default function App() {
  const [state, setState] = useState<CatalogState | null>(null)
  const [loading, setLoading] = useState(true)
  const [livePending, setLivePending] = useState(false)
  const [liveDone, setLiveDone] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [liveError, setLiveError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [showDetails, setShowDetails] = useState(false)
  /** Idade do cache local em ms (null se nao veio do cache). */
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null)
  /** true quando os dados veio do cache e nao houve requisicao a rede. */
  const [fromCacheOnly, setFromCacheOnly] = useState(false)

  /**
   * Carrega o catalogo.
   *
   * @param forceRefresh true = limpa o cache e ignora o TTL (botao "Atualizar")
   */
  const run = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setLivePending(true)
    setLiveError(null)

    // 1) Cache local / snapshot do build: instantaneo, sem rede.
    const initial = await loadInitialCatalog({ forceRefresh })

    if (initial.result) {
      setState(initial.result)
      setCacheAgeMs(initial.cacheAgeMs)
      setLoading(false)
    }

    // 2) Cache fresco: nada a fazer, nenhuma requisicao de rede.
    if (!initial.needsRevalidation) {
      setLivePending(false)
      setLiveDone(true)
      setFromCacheOnly(true)
      return
    }

    setFromCacheOnly(false)

    // 3) Revalidacao em background (stale-while-revalidate).
    const res = await revalidateCatalog()

    setAttempts(res.attempts)
    setLivePending(false)
    setLiveDone(true)

    if (res.result) {
      // Dados frescos: substituem o cache/snapshot.
      setState(res.result)
      setCacheAgeMs(null)
    } else if (initial.result) {
      // Rede falhou: mantem o que ja esta em tela (cache/snapshot) e avisa.
      setLiveError(
        'Nao foi possivel atualizar o catalogo online - mostrando a ultima versao salva.',
      )
    } else {
      setLiveError('Nao foi possivel consultar o catalogo online.')
    }
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  const catalog = state?.catalog ?? null

  const filtered = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLocaleLowerCase('pt-BR')

    return catalog.channels.filter(ch => {
      if (category !== 'all' && ch.category !== category) return false
      if (!q) return true
      return `${ch.name} ${ch.category} ${ch.slug}`.toLocaleLowerCase('pt-BR').includes(q)
    })
  }, [catalog, query, category])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const ch of catalog?.channels ?? []) {
      map.set(ch.category, (map.get(ch.category) ?? 0) + 1)
    }
    return map
  }, [catalog])

  const cacheInfo = getLocalCacheStatus()

  return (
    <div className="app">
      <header>
        <h1>WebTV v2 - parser embedcanais.online</h1>

        {loading && <p className="status">Carregando...</p>}

        {state && (
          <p className="status ok">
            {state.catalog.channels.length} canais | dados via:{' '}
            {STRATEGY_LABEL[state.strategy]} | fonte: {state.source}
          </p>
        )}

        {fromCacheOnly && (
          <p className="status ok">
            Cache local valido ({formatAge(cacheAgeMs)}) - nenhuma requisicao a rede foi feita.
          </p>
        )}

        {livePending && <p className="status">Consultando catalogo online...</p>}

        {liveDone && !livePending && state?.strategy === 'api' && (
          <p className="status ok">Catalogo obtido da API.</p>
        )}

        {liveDone && !livePending && state?.strategy === 'live' && (
          <p className="status ok">Requisicao ao vivo concluida com sucesso.</p>
        )}

        {liveError && <p className="status error">{liveError}</p>}

        {!loading && !state && <p className="status error">Nao foi possivel carregar os canais.</p>}

        <div className="controls">
          <button type="button" onClick={() => void run(true)}>
            Atualizar (ignora cache)
          </button>
          <button
            type="button"
            onClick={() => {
              // Limpa o cache e recarrega a pagina: a proxima carga parte
              // do zero (vai consultar a rede de novo).
              clearLocalCache()
              window.location.reload()
            }}
          >
            Limpar cache
          </button>
          <span className="count">
            cache: {cacheInfo.entry ? formatAge(cacheInfo.ageMs) : 'vazio'}
            {cacheInfo.entry ? (cacheInfo.fresh ? ' (fresco)' : ' (expirado)') : ''}
          </span>
        </div>
      </header>

      {attempts.length > 0 && (
        <section className="attempts">
          <h2>Tentativas de consulta ao catalogo</h2>
          <ul>
            {attempts.map((a, i) => (
              <li key={i} className={a.ok ? 'ok' : 'fail'}>
                <b>{STRATEGY_LABEL[a.strategy]}</b> {a.ok ? 'OK' : 'FALHOU: ' + a.error}
                <div className="url">{a.url}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {catalog && (
        <>
          <section className="controls">
            <input
              type="search"
              placeholder="Buscar canal..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="all">Todas ({catalog.channels.length})</option>
              {catalog.categories.map(cat => (
                <option key={cat} value={cat}>
                  {catalog.categoryLabels[cat] || cat} ({counts.get(cat) ?? 0})
                </option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={showDetails}
                onChange={e => setShowDetails(e.target.checked)}
              />{' '}
              Detalhes
            </label>
            <span className="count">{filtered.length} exibidos</span>
          </section>

          <section>
            <ul className="grid">
              {filtered.map(ch => (
                <ChannelCard key={ch.id || ch.slug} channel={ch} />
              ))}
            </ul>
            {filtered.length === 0 && <p className="status">Nenhum canal encontrado.</p>}
          </section>

          {showDetails && catalog.channels[0] && (
            <section className="raw">
              <h2>JSON bruto (primeiro canal)</h2>
              <pre>{JSON.stringify(catalog.channels[0], null, 2)}</pre>
            </section>
          )}
        </>
      )}
    </div>
  )
}
