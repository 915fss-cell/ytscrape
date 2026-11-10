import { neon } from "@neondatabase/serverless"

export type VideoHistory = {
  video: {
    youtubeVideoId: string
    title: string | null
    channelName: string | null
    playlists: string
  }
  snapshots: Array<{
    observedAt: string
    viewCount: number | null
    likeCount: number | null
    commentCount: number | null
  }>
}

export async function getVideoHistory(youtubeVideoId: string): Promise<VideoHistory | null> {
  if (!process.env.DATABASE_URL) return null
  const sql = neon(process.env.DATABASE_URL)
  const [video] = await sql`
    select
      v.youtube_video_id,
      v.title,
      v.channel_name,
      coalesce((
        select string_agg(coalesce(p.title, p.youtube_playlist_id), ', ' order by p.title)
        from playlist_videos pv
        join playlists p on p.id = pv.playlist_id
        where pv.video_id = v.id and pv.is_currently_member = true
      ), '') as playlists
    from videos v
    where v.youtube_video_id = ${youtubeVideoId}
  `
  if (!video) return null

  const snapshots = await sql`
    select observed_at, view_count, like_count, comment_count
    from video_statistics_snapshots vss
    join videos v on v.id = vss.video_id
    where v.youtube_video_id = ${youtubeVideoId}
    order by observed_at desc
  `

  return {
    video: {
      youtubeVideoId: String(video.youtube_video_id),
      title: video.title ? String(video.title) : null,
      channelName: video.channel_name ? String(video.channel_name) : null,
      playlists: String(video.playlists ?? ""),
    },
    snapshots: snapshots.map((snapshot) => ({
      observedAt: new Date(String(snapshot.observed_at)).toISOString(),
      viewCount: snapshot.view_count == null ? null : Number(snapshot.view_count),
      likeCount: snapshot.like_count == null ? null : Number(snapshot.like_count),
      commentCount: snapshot.comment_count == null ? null : Number(snapshot.comment_count),
    })),
  }
}
