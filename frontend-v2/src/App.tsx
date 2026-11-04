import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Attempt,
  API_URL,
  STRATEGY_LABEL,
  clearLocalCache,
  getEffectiveApiUrl,
  getLocalCacheStatus,
} from './lib/catalogSource'
import { CacheStatus } from './lib/catalogCache'
import { loadInitialCatalog, revalidateCatalog } from './lib/catalogLoader'
import { clearApiUrl, resolveChannelsUrl, writeApiUrl } from './lib/apiUrl'
import { EmbedcanaisCatalog } from './lib/parseEmbedcanais'
import { Theme, readTheme, writeTheme } from './lib/theme'
import { UsageMap, readUsage, recordOpen } from './lib/usage'
import { RankedChannel, rankChannels } from './lib/ranking'
import { eventBus } from './lib/events'
import { useBridgeIntegration } from './lib/useBridge'
import { Header } from './components/Header'
import { TopRow } from './components/TopRow'
import { Row } from './components/Row'
import { ChannelCard } from './components/ChannelCard'
import { SettingsPanel } from './components/SettingsPanel'
import { ApiFallbackScreen } from './components/ApiFallbackScreen'
import { DpadProvider } from './components/DpadContext'
import { useDpad, useDpadGroup } from './components/useDpad'

/** Altura da barra superior fixa (a rolagem do D-pad respeita). */
const TOPBAR_HEIGHT = 96

interface CatalogState {
  catalog: EmbedcanaisCatalog
  strategy: keyof typeof STRATEGY_LABEL
  source: string
  fetchedAt: number
}
export default function App() {
  return (
    <DpadProvider stickyTop={TOPBAR_HEIGHT}>
      <AppContent />
    </DpadProvider>
  )
}

function AppContent() {
  const [state, setState] = useState<CatalogState | null>(null)
  const [loading, setLoading] = useState(true)
  /**
   * true quando a carga terminou (com sucesso ou sem). Sem isso, a
   * tela de fallback apareceria durante o "Carregando catalogo...".
   */
  const [loadFinished, setLoadFinished] = useState(false)
  const [livePending, setLivePending] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [liveError, setLiveError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [showAttempts, setShowAttempts] = useState(false)
  /** Idade do cache local em ms (null se nao veio do cache). */
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null)
  /** Status do cache local (idade + freshness), para o painel de config. */
  const [cacheStatus, setCacheStatus] = useState<CacheStatus<EmbedcanaisCatalog> | null>(null)
  /** Tema da interface (dark = padrao). */
  const [theme, setTheme] = useState<Theme>('dark')
  /** Historico de uso dos canais (alimenta o ranking do Top 10). */
  const [usage, setUsage] = useState<UsageMap>({})
  /**
   * URL efetiva da API (override do usuario ou a do build).
   * `null` enquanto ainda nao foi lida do storage.
   */
  const [apiUrl, setApiUrl] = useState<string | null>(null)

  // Carrega tema e historico do storage unificado (assincrono).
  useEffect(() => {
    void readTheme().then(setTheme)
    void readUsage().then(setUsage)
  }, [])

  /**
   * Le a URL efetiva da API (override do usuario ou a do build).
   *
   * O override vive no storage do aparelho: ele permite trocar a API
   * sem rebuild (ver `lib/apiUrl.ts`).
   */
  useEffect(() => {
    void getEffectiveApiUrl().then(setApiUrl)
  }, [])

  // Aplica o tema no <html> (as cores sao controladas por CSS vars).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      void writeTheme(next)
      return next
    })
  }, [])

  /**
   * Carrega o catalogo.
   *
   * @param forceRefresh true = limpa o cache e ignora o TTL (botao "Atualizar")
   */
  const run = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setLivePending(true)
    setLiveError(null)

    try {
      // A URL BASE (override do usuario ou a do build) e o que a tela
      // mostra. O endpoint de catalogo e derivado dela (+ /channels).
      const effectiveApiUrl = await getEffectiveApiUrl()
      setApiUrl(effectiveApiUrl)

      // 1) Cache local / snapshot do build: instantaneo, sem rede.
      const initial = await loadInitialCatalog({ forceRefresh })

      if (initial.result) {
        setState(initial.result)
        setCacheAgeMs(initial.cacheAgeMs)
      }

      // Status do cache para o painel de configuracoes.
      void getLocalCacheStatus().then(setCacheStatus)

      // 2) Cache fresco: nada a fazer, nenhuma requisicao de rede.
      if (!initial.needsRevalidation) return

      // 3) Revalidacao em background (stale-while-revalidate).
      const res = await revalidateCatalog({ apiUrl: resolveChannelsUrl(effectiveApiUrl) })

      setAttempts(res.attempts)

      if (res.result) {
        // Dados frescos: substituem o cache/snapshot.
        setState(res.result)
        setCacheAgeMs(null)
      } else if (initial.result) {
        // Rede falhou: mantem o que ja esta em tela (cache/snapshot) e avisa.
        setLiveError('Nao foi possivel atualizar o catalogo online.')
      } else {
        // Nada em tela: a tela de fallback assume (ela tem a troca de URL).
        setLiveError('Nao foi possivel consultar o catalogo online.')
      }
    } finally {
      // `loading` SEMPRE volta a false: e o que libera a tela de fallback
      // quando nao ha nada para renderizar.
      setLoading(false)
      setLivePending(false)
      setLoadFinished(true)
    }
  }, [])

  useEffect(() => {
    void run()
  }, [run])

  const catalog = state?.catalog ?? null

  /** Canais filtrados pela busca (case/accent-insensitive). */
  const searched = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return catalog.channels
    return catalog.channels.filter(ch =>
      `${ch.name} ${ch.category} ${ch.slug}`.toLocaleLowerCase('pt-BR').includes(q),
    )
  }, [catalog, query])

  /** Canais da categoria selecionada ("" = todas). */
  const byCategory = useMemo(() => {
    if (!catalog) return []
    if (!category) return searched
    return searched.filter(ch => ch.category === category)
  }, [catalog, searched, category])

  /**
   * Top 10 ranqueado: sinais do catalogo (categoria, posicao no site,
   * marca) + sinais do usuario (frequencia, recencia). Ver lib/ranking.ts.
   */
  const featured = useMemo<RankedChannel[]>(() => {
    if (!catalog) return []
    return rankChannels(catalog.channels, usage, Date.now(), 10)
  }, [catalog, usage])

  /** Registra a abertura de um canal (alimenta o ranking futuro). */
  const handleChannelOpen = useCallback((channel: { slug: string }) => {
    void recordOpen(channel.slug).then(() => readUsage()).then(setUsage)
  }, [])

  /*
   * Integracao com o app Kotlin (Events API).
   *
   * O `openChannel` e o que substitui o `href` do card: ele emite
   * `channel:clicked` (com `id`/`name`/`type` no nivel raiz do
   * payload) e mantem o Kotlin sincronizado com o canal ativo.
   */
  const { active, openChannel, closeChannel, notifyNavigatedHome } =
    useBridgeIntegration({
      channels: catalog?.channels.length ?? 0,
      categories: catalog?.categories.length ?? 0,
      onOpen: handleChannelOpen,
    })

  /*
   * "Back" (Esc) fecha o canal aberto.
   *
   * O tratador fica na pilha do D-pad: como o canal esta no topo, ele
   * tem prioridade sobre os modais (configuracoes, busca) - que sao
   * camadas registradas depois.
   */
  const { pushBack } = useDpad()
  useEffect(() => {
    if (!active) return
    return pushBack(closeChannel)
  }, [active, closeChannel, pushBack])

  /**
   * Linhas horizontais: agrupadas por categoria.
   * A categoria do canal em destaque fica de fora (ja aparece em destaque).
   */
  const rows = useMemo(() => {
    if (!catalog) return []
    const featuredCategory = featured[0]?.channel.category
    return catalog.categories
      .filter(cat => cat !== featuredCategory)
      .map(cat => ({
        category: cat,
        label: catalog.categoryLabels[cat] || cat,
        channels: searched.filter(ch => ch.category === cat),
      }))
      .filter(row => row.channels.length > 0)
  }, [catalog, searched, featured])

  const handleSelectCategory = (next: string) => {
    setCategory(next)
    // Voltar para a Home limpa a busca: a busca e um filtro global e
    // esconderia a home inteira enquanto estiver preenchida.
    if (next === '') setQuery('')
    window.scrollTo({ top: 0, behavior: 'smooth' })

    // Avisa o app Kotlin qual categoria foi escolhida.
    eventBus.emit('category:changed', {
      categoryId: next || null,
      categoryName: next
        ? catalog?.categoryLabels[next] || next
        : 'Início',
    })

    // Voltar para a home reseta o estado de injecao do Kotlin.
    if (next === '') notifyNavigatedHome()
  }

  /**
   * Avisa o app Kotlin que a busca mudou.
   *
   * O `query` e controlled pelo Header (a busca vive em tela cheia),
   * entao o evento sai daqui, no unico lugar que conhece o valor.
   */
  const handleQueryChange = useCallback((next: string) => {
    setQuery(next)
    eventBus.emit('search:changed', { query: next })
  }, [])

  const handleClearCache = () => {
    // Limpa o cache e recarrega a pagina: a proxima carga parte do zero.
    void clearLocalCache().then(() => window.location.reload())
  }

  /**
   * Grava a URL da API escolhida pelo usuario e recarrega o app.
   *
   * O `mode` diz como interpretar a URL digitada:
   *   - `base`  : a URL e a base; o `/channels` e acrescentado;
   *   - `exact` : a URL ja e o endpoint; e usada como esta.
   *
   * O override fica no storage do aparelho - ele NAO altera o bundle
   * publicado. Serve para o aparelho do usuario continuar funcionando
   * enquanto a API oficial volta: sem rebuild, sem deploy, sem push.
   */
  const handleSaveApiUrl = useCallback((url: string) => {
    void writeApiUrl(url).then(saved => {
      if (!saved) return
      // Recarrega: a carga inicial ja le o override e usa a nova URL.
      window.location.reload()
    })
  }, [])

  /**
   * Apaga o override: a app volta a usar a URL embutida no build.
   */
  const handleResetApiUrl = useCallback(() => {
    void clearApiUrl().then(() => {
      setApiUrl(API_URL)
      window.location.reload()
    })
  }, [])

  /**
   * Tenta consultar a API de novo (sem trocar a URL).
   *
   * A tela de fallback e mostrada quando nao ha NADA para renderizar,
   * entao a tentativa precisa forcar a rede (o cache esta vazio).
   */
  const handleRetryApi = useCallback(() => {
    void run(true)
  }, [run])

  /**
   * O grid (categoria ou resultado de busca) e um grupo do D-pad com as
   * QUATRO direcoes: as setas andam entre os cards (em linha e em
   * coluna), como em um app de TV.
   */
  const gridRef = useRef<HTMLUListElement | null>(null)
  const setGridRef = useDpadGroup('grid', {
    priority: 80,
    axes: 'both',
  })

  const attachGrid = useCallback(
    (node: HTMLUListElement | null) => {
      gridRef.current = node
      setGridRef(node)
    },
    [setGridRef],
  )

  /*
   * Tela de fallback: NAO ha nada para renderizar (nem cache, nem
   * snapshot, nem rede) E o usuario pode trocar a URL da API.
   *
   * A tela e renderizada NO LUGAR do conteudo - e nao como modal,
   * porque nao ha conteudo atras dela para desfocar.
   */
  const showFallback = loadFinished && !state

  if (showFallback) {
    return (
      <div className="app" data-strategy="">
        <ApiFallbackScreen
          buildApiUrl={API_URL}
          currentApiUrl={apiUrl ?? API_URL}
          attempts={attempts}
          busy={loading || livePending}
          onSave={handleSaveApiUrl}
          onRetry={handleRetryApi}
          onReset={handleResetApiUrl}
        />
      </div>
    )
  }

  return (
    <div className="app" data-strategy={state?.strategy ?? ''}>
      <Header
        categories={catalog?.categories ?? []}
        categoryLabels={catalog?.categoryLabels ?? {}}
        activeCategory={category}
        onSelectCategory={handleSelectCategory}
        query={query}
        onQueryChange={handleQueryChange}
        total={catalog?.channels.length ?? 0}
        settingsTitle="Configuracoes"
        settings={
          <SettingsPanel
            cacheAgeMs={cacheAgeMs ?? cacheStatus?.ageMs ?? null}
            cacheFresh={cacheStatus?.fresh ?? false}
            strategyLabel={state ? STRATEGY_LABEL[state.strategy] : '-'}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            attempts={attempts}
            showAttempts={showAttempts}
            onToggleAttempts={() => setShowAttempts(v => !v)}
            onRefresh={() => void run(true)}
            onClearCache={handleClearCache}
            buildApiUrl={API_URL}
            currentApiUrl={apiUrl ?? API_URL}
            onSaveApiUrl={handleSaveApiUrl}
            onResetApiUrl={handleResetApiUrl}
          />
        }
      />

      <main className="content">
        {loading && !state && <p className="status">Carregando catalogo...</p>}

        {livePending && state && <p className="status">Atualizando catalogo...</p>}

        {liveError && <p className="status error">{liveError}</p>}

        {!loading && !state && <p className="status error">Nao foi possivel carregar os canais.</p>}

        {/* ---------- HOME ---------- */}
        {catalog && !category && !query && (
          <>
            <TopRow
              title="Top 10"
              subtitle={
                Object.keys(usage).length > 0 ? 'seu ranking' : 'destaques do catalogo'
              }
              channels={featured}
              onOpen={openChannel}
            />

            {rows.map(row => (
              <Row
                key={row.category}
                title={row.label}
                subtitle={`${row.channels.length} canais`}
                channels={row.channels}
                onOpen={openChannel}
              />
            ))}
          </>
        )}

        {/* ---------- CATEGORIA ---------- */}
        {catalog && category && !query && (
          <>
            <section className="section-head">
              <h2 className="section-title">
                {catalog.categoryLabels[category] || category}
              </h2>
              <p className="section-sub">
                {byCategory.length} canais nesta categoria
              </p>
            </section>

            <ul className="grid" ref={attachGrid}>
              {byCategory.map(ch => (
                <li key={ch.id || ch.slug}>
                  <ChannelCard channel={ch} onSelect={openChannel} />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ---------- BUSCA ---------- */}
        {catalog && query && (
          <>
            <section className="section-head">
              <h2 className="section-title">
                Resultados para &quot;{query}&quot;
              </h2>
              <p className="section-sub">{byCategory.length} canais encontrados</p>
            </section>

            {byCategory.length > 0 ? (
              <ul className="grid" ref={attachGrid}>
                {byCategory.map(ch => (
                  <li key={ch.id || ch.slug}>
                    <ChannelCard channel={ch} onSelect={openChannel} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="status">Nenhum canal encontrado.</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
