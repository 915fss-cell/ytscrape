import { ListVideo } from "lucide-react"
import { AddPlaylistForm } from "../components/add-playlist-form"
import { Sidebar } from "../components/sidebar"
import { formatDate, getDashboardData } from "../../lib/dashboard"

export const dynamic = "force-dynamic"

export default async function PlaylistsPage() {
  const data = await getDashboardData()
  return <div className="shell"><Sidebar active="playlists" /><main className="main"><header className="topbar"><div><div className="eyebrow">Sources / playlists</div><h1>Playlist registry.</h1><p className="lede">Manage the sources that feed your collection runs.</p></div><div className="actions"><AddPlaylistForm /></div></header>{data.connectionError && <div className="notice" role="alert">{data.connectionError}</div>}<section className="panel"><div className="panel-head"><h2 className="panel-title">Registered playlists</h2><span className="panel-meta">{data.playlists.length} total</span></div>{data.playlists.length ? <div className="playlist-list">{data.playlists.map((playlist) => <div className="playlist-row" key={playlist.id}><div className="playlist-badge"><ListVideo size={17} /></div><div className="playlist-copy"><p className="playlist-name">{playlist.title || playlist.youtubePlaylistId}</p><div className="playlist-sub">{playlist.url} · Last collected {formatDate(playlist.lastCollected)}</div></div><div className="playlist-count">{playlist.isActive ? "Active" : "Paused"}<small>{playlist.videoCount} current videos</small></div></div>)}</div> : <div className="empty">No playlists registered yet. Add a YouTube playlist to begin.</div>}</section></main></div>
}
