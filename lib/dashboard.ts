import { neon } from "@neondatabase/serverless"

export type DashboardData = {
  connected: boolean
  connectionError?: string
  playlists: Array<{
    id: string
    title: string | null
    url: string
    youtubePlaylistId: string
    videoCount: number
    lastCollected: string | null
    isActive: boolean
  }>
  stats: {
    activePlaylists: number
    trackedVideos: number
    totalViews: number
    milestones: number
  }
  runs: Array<{
    id: string
    startedAt: string
    status: string
    playlistsSucceeded: number
    playlistsFailed: number
    videosDiscovered: number
    statisticsCollected: number
  }>
  videos: Array<{
    id: string
    youtubeVideoId: string
    title: string | null
    channelName: string | null
    playlists: string
    viewCount: number | null
    likeCount: number | null
    commentCount: number | null
    observedAt: string | null
  }>
}

const emptyData: DashboardData = {
  connected: false,
  playlists: [],
  stats: { activePlaylists: 0, trackedVideos: 0, totalViews: 0, milestones: 0 },
  runs: [],
  videos: [],
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) {
    return { ...emptyData, connectionError: "DATABASE_URL is not configured." }
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const [playlists, stats, runs, videos] = await Promise.all([
      sql`
        select
          p.id::text,
          p.title,
          p.url,
          p.youtube_playlist_id,
          p.is_active,
          p.last_successful_collection_at,
          count(pv.video_id)::int as video_count
        from playlists p
        left join playlist_videos pv
          on pv.playlist_id = p.id and pv.is_currently_member = true
        group by p.id
        order by p.is_active desc, p.updated_at desc
      `,
      sql`
        with latest as (
          select distinct on (video_id) video_id, view_count
          from video_statistics_snapshots
          order by video_id, observed_at desc
        )
        select
          (select count(*)::int from playlists where is_active = true) as active_playlists,
          (select count(distinct pv.video_id)::int
             from playlist_videos pv
             join playlists p on p.id = pv.playlist_id
             where pv.is_currently_member = true and p.is_active = true) as tracked_videos,
          coalesce((select sum(latest.view_count)::bigint from latest where exists (
            select 1 from playlist_videos pv
            join playlists p on p.id = pv.playlist_id
            where pv.video_id = latest.video_id
              and pv.is_currently_member = true
              and p.is_active = true
          )), 0) as total_views,
          (select count(*)::int from video_milestones where status = 'reached') as milestones
      `,
      sql`
        select
          id::text,
          started_at,
          status,
          playlists_succeeded,
          playlists_failed,
          videos_discovered,
          statistics_collected
        from collection_runs
        order by started_at desc
        limit 5
      `,
      sql`
        with latest as (
          select distinct on (video_id)
            video_id, view_count, like_count, comment_count, observed_at
          from video_statistics_snapshots
          order by video_id, observed_at desc
        )
        select
          v.id::text,
          v.youtube_video_id,
          v.title,
          v.channel_name,
          coalesce((
            select string_agg(coalesce(p.title, p.youtube_playlist_id), ', ' order by p.title)
            from playlist_videos pv2
            join playlists p on p.id = pv2.playlist_id
            where pv2.video_id = v.id and pv2.is_currently_member = true
          ), '') as playlists,
          latest.view_count,
          latest.like_count,
          latest.comment_count,
          latest.observed_at
        from videos v
        left join latest on latest.video_id = v.id
        where exists (
          select 1
          from playlist_videos pv3
          join playlists p3 on p3.id = pv3.playlist_id
          where pv3.video_id = v.id
            and pv3.is_currently_member = true
            and p3.is_active = true
        )
        order by coalesce(latest.view_count, 0) desc, v.updated_at desc
        limit 100
      `,
    ])

    return {
      connected: true,
      playlists: playlists.map((row) => ({
        id: String(row.id),
        title: row.title ? String(row.title) : null,
        url: String(row.url),
        youtubePlaylistId: String(row.youtube_playlist_id),
        videoCount: Number(row.video_count ?? 0),
        lastCollected: row.last_successful_collection_at
          ? new Date(String(row.last_successful_collection_at)).toISOString()
          : null,
        isActive: Boolean(row.is_active),
      })),
      stats: {
        activePlaylists: Number(stats[0]?.active_playlists ?? 0),
        trackedVideos: Number(stats[0]?.tracked_videos ?? 0),
        totalViews: Number(stats[0]?.total_views ?? 0),
        milestones: Number(stats[0]?.milestones ?? 0),
      },
      runs: runs.map((row) => ({
        id: String(row.id),
        startedAt: new Date(String(row.started_at)).toISOString(),
        status: String(row.status),
        playlistsSucceeded: Number(row.playlists_succeeded ?? 0),
        playlistsFailed: Number(row.playlists_failed ?? 0),
        videosDiscovered: Number(row.videos_discovered ?? 0),
        statisticsCollected: Number(row.statistics_collected ?? 0),
      })),
      videos: videos.map((row) => ({
        id: String(row.id),
        youtubeVideoId: String(row.youtube_video_id),
        title: row.title ? String(row.title) : null,
        channelName: row.channel_name ? String(row.channel_name) : null,
        playlists: String(row.playlists ?? ""),
        viewCount: row.view_count == null ? null : Number(row.view_count),
        likeCount: row.like_count == null ? null : Number(row.like_count),
        commentCount: row.comment_count == null ? null : Number(row.comment_count),
        observedAt: row.observed_at ? new Date(String(row.observed_at)).toISOString() : null,
      })),
    }
  } catch (error) {
    return {
      ...emptyData,
      connectionError: error instanceof Error ? error.message : "Unable to reach Neon.",
    }
  }
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

export function formatDate(value: string | null) {
  if (!value) return "Never collected"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
}

const KST_TIME_ZONE = "Asia/Seoul"

export function formatDateTime(value: string | null) {
  if (!value) return "Never collected"
  return new Intl.DateTimeFormat("en-US", { timeZone: KST_TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
}

export function getKstDate(value: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
}
