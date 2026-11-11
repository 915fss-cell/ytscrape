import { Activity } from "lucide-react"
import { CollectButton } from "../components/collect-button"
import { Sidebar } from "../components/sidebar"
import { formatDateTime, getDashboardData } from "../../lib/dashboard"

export const dynamic = "force-dynamic"

export default async function RunsPage() {
  const data = await getDashboardData()
  return <div className="shell"><Sidebar active="runs" /><main className="main"><header className="topbar"><div><div className="eyebrow">Operations / collection</div><h1>Collection runs.</h1><p className="lede">Every playlist sync, snapshot, and failure in one place. Times shown in KST.</p></div><div className="actions"><CollectButton /></div></header>{data.connectionError && <div className="notice" role="alert">{data.connectionError}</div>}<section className="panel"><div className="panel-head"><h2 className="panel-title">Run history</h2><span className="panel-meta">latest 5</span></div>{data.runs.length ? <div className="run-list">{data.runs.map((run) => <div className="run-row" key={run.id}><div><div className="run-date"><Activity size={14} className="icon-lime" /> {formatDateTime(run.startedAt)}</div><div className="run-detail">{run.playlistsSucceeded} playlists succeeded · {run.playlistsFailed} failed · {run.videosDiscovered} videos · {run.statisticsCollected} snapshots</div></div><span className={`pill ${run.status}`}>{run.status}</span></div>)}</div> : <div className="empty">No collection runs yet. Register playlists, then run <code>ytscrape collect</code> from the scraper environment.</div>}</section></main></div>
}
