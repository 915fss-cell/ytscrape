import { Sidebar } from "../components/sidebar"
import { getDashboardData } from "../../lib/dashboard"
import { VideosTable } from "./videos-table"

export const dynamic = "force-dynamic"

export default async function VideosPage() {
  const data = await getDashboardData()
  return <div className="shell"><Sidebar active="videos" /><main className="main"><header className="topbar"><div><div className="eyebrow">Library / collected data</div><h1>Video performance.</h1><p className="lede">The latest records saved from your playlist collection runs.</p></div><div className="actions"><span className="data-count">{data.videos.length} records shown</span></div></header>{data.connectionError && <div className="notice" role="alert">{data.connectionError}</div>}<section className="panel"><div className="panel-head"><h2 className="panel-title">Collected videos</h2><span className="panel-meta">sorted by latest views</span></div>{data.videos.length ? <VideosTable videos={data.videos} /> : <div className="empty">No video records are available yet. Run a collection after registering your playlists.</div>}</section></main></div>
}
