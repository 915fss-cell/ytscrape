import { Database, TrendingUp } from "lucide-react"
import { Sidebar } from "../components/sidebar"
import { formatDateTime, formatNumber } from "../../lib/dashboard"
import { getTotalViewsHistory, type TotalViewsMode } from "../../lib/total-views"

export const dynamic = "force-dynamic"

type PageProps = {
  searchParams: Promise<{ mode?: string | string[] }>
}

export default async function TotalViewsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const mode: TotalViewsMode = params.mode === "daily" ? "daily" : "hourly"
  const history = await getTotalViewsHistory(mode)
  const latest = history.records[0]

  return (
    <div className="shell">
      <Sidebar active="totalViews" />
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Analytics / all videos</div>
            <h1>Total views.</h1>
            <p className="lede">Combined view totals from every saved video snapshot. Times shown in KST.</p>
          </div>
          <nav className="history-mode" aria-label="Total views history interval">
            <a href="/total-views?mode=hourly" aria-current={mode === "hourly" ? "page" : undefined} className={mode === "hourly" ? "active" : ""}>Hourly</a>
            <a href="/total-views?mode=daily" aria-current={mode === "daily" ? "page" : undefined} className={mode === "daily" ? "active" : ""}>Daily</a>
          </nav>
        </header>

        {history.connectionError && <div className="notice" role="alert"><Database size={14} /> {history.connectionError}</div>}

        <section className="metric-grid" aria-label="Total views summary">
          <article className="metric-card"><span>Latest combined total</span><strong>{formatNumber(latest?.totalViews ?? 0)}</strong></article>
          <article className="metric-card"><span>{mode === "hourly" ? "Collections saved" : "Daily baselines saved"}</span><strong>{formatNumber(history.records.length)}</strong></article>
          <article className="metric-card"><span>Videos included in latest point</span><strong>{formatNumber(latest?.videosIncluded ?? 0)}</strong></article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">{mode === "hourly" ? "Hourly total history" : "Daily total history"}</h2>
            <span className="panel-meta">latest {history.records.length}</span>
          </div>
          {history.records.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Observed (KST)</th><th>Total views</th><th>Change</th><th>Videos included</th></tr></thead>
                <tbody>
                  {history.records.map((record, index) => {
                    const previous = history.records[index + 1]
                    const change = previous ? record.totalViews - previous.totalViews : null
                    return (
                      <tr key={record.id}>
                        <td>{formatDateTime(record.observedAt)}</td>
                        <td>{formatNumber(record.totalViews)}</td>
                        <td className={change === null ? "delta-neutral" : change > 0 ? "delta-positive" : change < 0 ? "delta-negative" : "delta-neutral"}>
                          {change === null ? "—" : `${change > 0 ? "+" : ""}${formatNumber(change)}`}
                        </td>
                        <td>{formatNumber(record.videosIncluded)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty"><TrendingUp size={16} /> No saved view snapshots yet. Totals will appear after the next collection.</div>
          )}
        </section>

        <p className="history-note">
          {mode === "daily"
            ? "Daily total sums the first saved snapshot for each video on each KST calendar day."
            : "Hourly total sums every video snapshot saved in each collection run."}
        </p>
      </main>
    </div>
  )
}
