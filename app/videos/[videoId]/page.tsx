import { notFound } from "next/navigation"
import { Sidebar } from "../../components/sidebar"
import { formatDateTime, formatNumber } from "../../../lib/dashboard"
import { getVideoHistory } from "../../../lib/video-history"

export const dynamic = "force-dynamic"

export default async function VideoDetailPage({ params, searchParams }: { params: Promise<{ videoId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { videoId } = await params
  const { date } = await searchParams
  const history = await getVideoHistory(videoId)
  if (!history) notFound()

  const latest = history.snapshots[0]
  const selectedDate = date || latest?.observedAt.slice(0, 10) || ""
  const daySnapshots = history.snapshots.filter((snapshot) => snapshot.observedAt.slice(0, 10) === selectedDate)
  const availableDates = [...new Set(history.snapshots.map((snapshot) => snapshot.observedAt.slice(0, 10)))].sort()
  const minDate = availableDates[0] || undefined
  const maxDate = availableDates.at(-1) || undefined
  return <div className="shell"><Sidebar active="videos" /><main className="main"><header className="topbar"><div><div className="eyebrow">Library / video history</div><h1>{history.video.title || history.video.youtubeVideoId}</h1><p className="lede">Hourly performance snapshots saved from your collection runs.</p></div><div className="actions"><a className="button secondary" href={`https://www.youtube.com/watch?v=${history.video.youtubeVideoId}`} target="_blank" rel="noreferrer">Open on YouTube</a></div></header><section className="video-detail-hero"><img src={`https://i.ytimg.com/vi/${history.video.youtubeVideoId}/hqdefault.jpg`} alt="" /><div><span>{history.video.channelName || "Channel unavailable"}</span><small>{history.video.playlists || "Unassigned"}</small></div></section><section className="metric-grid"><article className="metric-card"><span>Views</span><strong>{latest?.viewCount == null ? "—" : formatNumber(latest.viewCount)}</strong></article><article className="metric-card"><span>Likes</span><strong>{latest?.likeCount == null ? "—" : formatNumber(latest.likeCount)}</strong></article><article className="metric-card"><span>Comments</span><strong>{latest?.commentCount == null ? "—" : formatNumber(latest.commentCount)}</strong></article></section><section className="panel"><div className="panel-head"><div><h2 className="panel-title">Hourly history</h2><span className="panel-meta">{daySnapshots.length} snapshots for {selectedDate || "selected day"}</span></div><form className="history-calendar" method="get"><label htmlFor="history-date">Calendar day</label><input id="history-date" name="date" type="date" defaultValue={selectedDate} min={minDate} max={maxDate} /><button className="button secondary" type="submit">View day</button></form></div>{daySnapshots.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Observed</th><th>Views</th><th>Likes</th><th>Comments</th></tr></thead><tbody>{daySnapshots.map((snapshot) => <tr key={snapshot.observedAt}><td>{formatDateTime(snapshot.observedAt)}</td><td>{snapshot.viewCount == null ? "—" : formatNumber(snapshot.viewCount)}</td><td>{snapshot.likeCount == null ? "—" : formatNumber(snapshot.likeCount)}</td><td>{snapshot.commentCount == null ? "—" : formatNumber(snapshot.commentCount)}</td></tr>)}</tbody></table></div> : <div className="empty">No hourly snapshots were saved for this day.</div>}</section></main></div>
}
