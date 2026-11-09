import { ArrowUpRight, Database, ListVideo, Radio, Target } from "lucide-react"
import { AddPlaylistForm } from "./components/add-playlist-form"
import { Sidebar } from "./components/sidebar"
import { getDashboardData, formatDate, formatNumber } from "../lib/dashboard"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="shell">
      <Sidebar active="overview" />

      <main className="main" id="overview">
        <header className="topbar">
          <div>
            <div className="eyebrow">Operations / analytics</div>
            <h1>Good morning, operator.</h1>
            <p className="lede">A live view of your YouTube collection system.</p>
          </div>
          <div className="actions"><AddPlaylistForm /></div>
        </header>

        {data.connectionError && <div className="notice" role="alert"><Database size={14} /> {data.connectionError}</div>}

        <section className="stats" aria-label="Analytics overview">
          <StatCard icon={<ListVideo size={15} />} label="Active playlists" value={String(data.stats.activePlaylists)} detail="being monitored" />
          <StatCard icon={<Radio size={15} />} label="Tracked videos" value={formatNumber(data.stats.trackedVideos)} detail="across all playlists" />
          <StatCard icon={<ArrowUpRight size={15} />} label="Total views" value={formatNumber(data.stats.totalViews)} detail="latest snapshots" />
          <StatCard icon={<Target size={15} />} label="Milestones" value={String(data.stats.milestones)} detail="thresholds reached" />
        </section>

        <div className="content-grid">
          <section className="panel" id="playlists">
            <div className="panel-head"><h2 className="panel-title">Active playlists</h2><span className="panel-meta">{data.playlists.length} registered</span></div>
            {data.playlists.length ? <div className="playlist-list">{data.playlists.map((playlist) => <PlaylistRow key={playlist.id} playlist={playlist} />)}</div> : <div className="empty">No playlists registered yet. Add your first playlist to begin collecting video membership and statistics.</div>}
          </section>

          <section className="panel" id="runs">
            <div className="panel-head"><h2 className="panel-title">Recent collection runs</h2><span className="panel-meta">latest 5</span></div>
            {data.runs.length ? <div className="run-list">{data.runs.map((run) => <RunRow key={run.id} run={run} />)}</div> : <div className="empty">No collection runs yet. Run <code>ytscrape collect</code> after adding a playlist.</div>}
          </section>
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="stat-card"><div className="stat-label icon-lime">{icon}{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></article>
}

function PlaylistRow({ playlist }: { playlist: Awaited<ReturnType<typeof getDashboardData>>["playlists"][number] }) {
  return <div className="playlist-row"><div className="playlist-badge"><ListVideo size={17} /></div><div className="playlist-copy"><p className="playlist-name">{playlist.title || playlist.youtubePlaylistId}</p><div className="playlist-sub">Last collected {formatDate(playlist.lastCollected)}</div></div><div className="playlist-count">{playlist.videoCount}<small>current videos</small></div></div>
}

function RunRow({ run }: { run: Awaited<ReturnType<typeof getDashboardData>>["runs"][number] }) {
  return <div className="run-row"><div><div className="run-date">{formatDate(run.startedAt)}</div><div className="run-detail">{run.playlistsSucceeded} playlists · {run.videosDiscovered} videos · {run.statisticsCollected} snapshots</div></div><span className={`pill ${run.status}`}>{run.status}</span></div>
}
