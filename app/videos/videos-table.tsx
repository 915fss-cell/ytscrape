"use client"

import { ExternalLink, PlaySquare } from "lucide-react"
import { useMemo, useState } from "react"
import { formatDate, formatNumber } from "../../lib/dashboard"

type Video = {
  id: string
  youtubeVideoId: string
  title: string | null
  channelName: string | null
  playlists: string
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  observedAt: string | null
}

export function VideosTable({ videos }: { videos: Video[] }) {
  const [selectedPlaylist, setSelectedPlaylist] = useState("All")
  const playlists = useMemo(() => Array.from(new Set(videos.flatMap((video) => video.playlists.split(", ").filter(Boolean)))), [videos])
  const filteredVideos = selectedPlaylist === "All" ? videos : videos.filter((video) => video.playlists.split(", ").includes(selectedPlaylist))

  return <>
    <div className="video-tabs" role="tablist" aria-label="Filter videos by playlist">
      <button className={selectedPlaylist === "All" ? "video-tab active" : "video-tab"} onClick={() => setSelectedPlaylist("All")} role="tab" aria-selected={selectedPlaylist === "All"}>{`All (${videos.length})`}</button>
      {playlists.map((playlist) => <button key={playlist} className={selectedPlaylist === playlist ? "video-tab active" : "video-tab"} onClick={() => setSelectedPlaylist(playlist)} role="tab" aria-selected={selectedPlaylist === playlist}>{`${playlist} (${videos.filter((video) => video.playlists.split(", ").includes(playlist)).length})`}</button>)}
    </div>
    {filteredVideos.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Video</th><th>Playlist</th><th>Views</th><th>Likes</th><th>Comments</th><th>Observed</th></tr></thead><tbody>{filteredVideos.map((video) => <tr key={video.id}><td><div className="video-title"><PlaySquare size={15} className="icon-lime" /><div><a href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`} target="_blank" rel="noreferrer">{video.title || video.youtubeVideoId}<ExternalLink size={11} /></a><small>{video.channelName || "Channel unavailable"}</small></div></div></td><td>{video.playlists || "Unassigned"}</td><td>{video.viewCount == null ? "—" : formatNumber(video.viewCount)}</td><td>{video.likeCount == null ? "—" : formatNumber(video.likeCount)}</td><td>{video.commentCount == null ? "—" : formatNumber(video.commentCount)}</td><td>{formatDate(video.observedAt)}</td></tr>)}</tbody></table></div> : <div className="empty">No videos are assigned to this playlist.</div>}
  </>
}
