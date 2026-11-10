import { notFound } from "next/navigation"
import { Sidebar } from "../../components/sidebar"
import { formatDateTime, formatNumber, getKstDate } from "../../../lib/dashboard"
import { getVideoHistory } from "../../../lib/video-history"

export const dynamic = "force-dynamic"

type PageProps = {
  params: Promise<{ videoId: string }>
  searchParams: Promise<{ date?: string; mode?: string }>
}

export default async function VideoDetailPage({ params, searchParams }: PageProps) {
  const { videoId } = await params
  const { date, mode } = await searchParams
  const history = await getVideoHistory(videoId)
  if (!history) notFound()

  const latest = history.snapshots[0]
  const selectedDate = date || getKstDate(latest?.observedAt || null)
  const daySnapshots = history.snapshots.filter((snapshot) => getKstDate(snapshot.observedAt) === selectedDate)
  const historyMode = mode === "daily" ? "daily" : "hourly"
  const displayedSnapshots = historyMode === "daily" ? (daySnapshots.at(-1) ? [daySnapshots.at(-1)!] : []) : daySnapshots
  const availableDates = [...new Set(history.snapshots.map((snapshot) => getKstDate(snapshot.observedAt)))].sort()
  const minDate = availableDates[0] || undefined
  const maxDate = availableDates.at(-1) || undefined

  return (
    <div className="shell">
      <Sidebar active="videos" />
      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Library / video history</div>
            <h1>{history.video.title || history.video.youtubeVideoId}</h1>
            <p className="lede">Hourly performance snapshots saved from your collection runs. Times shown in KST.</p>
          </div>
          <div className="actions">
            <a className="button secondary" href={`https://www.youtube.com/watch?v=${history.video.youtubeVideoId}`} target="_blank" rel="noreferrer">Open on YouTube</a>
          </div>
        </header>

        <section className="video-detail-hero">
          <img src={`https://i.ytimg.com/vi/${history.video.youtubeVideoId}/hqdefault.jpg`} alt="" />
          <div><span>{history.video.channelName || "Channel unavailable"}</span><small>{history.video.playlists || "Unassigned"}</small></div>
        </section>

        <section className="metric-grid">
          <article className="metric-card"><span>Views</span><strong>{latest?.viewCount == null ? "—" : formatNumber(latest.viewCount)}</strong></article>
          <article className="metric-card"><span>Likes</span><strong>{latest?.likeCount == null ? "—" : formatNumber(latest.likeCount)}</strong></article>
          <article className="metric-card"><span>Comments</span><strong>{latest?.commentCount == null ? "—" : formatNumber(latest.commentCount)}</strong></article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">{historyMode === "daily" ? "Daily history" : "Hourly history"}</h2>
              <span className="panel-meta">{historyMode === "daily" ? "00:00 KST baseline" : `${daySnapshots.length} snapshots`} for {selectedDate || "selected day"}</span>
            </div>
            <div className="history-controls">
              <nav className="history-mode" aria-label="History view">
                <a className={historyMode === "hourly" ? "active" : ""} href={`?date=${selectedDate}&mode=hourly`}>Hourly</a>
                <a className={historyMode === "daily" ? "active" : ""} href={`?date=${selectedDate}&mode=daily`}>Daily</a>
              </nav>
              <form className="history-calendar" method="get">
                <input type="hidden" name="mode" value={historyMode} />
                <label htmlFor="history-date">Calendar day (KST)</label>
                <input id="history-date" name="date" type="date" defaultValue={selectedDate} min={minDate} max={maxDate} />
                <button className="button secondary" type="submit">View day</button>
              </form>
            </div>
          </div>
          {displayedSnapshots.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Observed</th><th>Views</th><th>Likes</th><th>Comments</th></tr></thead>
                <tbody>{displayedSnapshots.map((snapshot) => <tr key={snapshot.observedAt}><td>{formatDateTime(snapshot.observedAt)}</td><td>{snapshot.viewCount == null ? "—" : formatNumber(snapshot.viewCount)}</td><td>{snapshot.likeCount == null ? "—" : formatNumber(snapshot.likeCount)}</td><td>{snapshot.commentCount == null ? "—" : formatNumber(snapshot.commentCount)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="empty">No hourly snapshots were saved for this day.</div>}
        </section>
      </main>
    </div>
  )
}
