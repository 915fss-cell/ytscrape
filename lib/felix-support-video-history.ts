import { neon } from "@neondatabase/serverless"

type VideoHistoryPoint = {
  observedAt: string
  snapshotDate?: string
  collectionRunId?: string
  viewCount: number | null
  viewChange: number | null
  likeCount: number | null
  likeChange: number | null
  commentCount: number | null
  commentChange: number | null
}

type VideoHistoryBundle = {
  videoId: string
  title: string | null
  channelName: string | null
  playlists: string
  hourly: VideoHistoryPoint[]
  daily: VideoHistoryPoint[]
  pagination: {
    hourly: { limit: number; offset: number; total: number; hasMore: boolean }
    daily: { limit: number; offset: number; total: number; hasMore: boolean }
  }
}

function nullableNumber(value: unknown) {
  return value == null ? null : Number(value)
}

function toIsoTimestamp(value: unknown) {
  return new Date(String(value)).toISOString()
}

export async function getFelixSupportVideoHistory(limit: number, offset: number) {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.")

  const sql = neon(process.env.DATABASE_URL)
  const [catalog, hourlyRows, dailyRows] = await Promise.all([
    sql`
      select
        v.id::text as video_key,
        v.youtube_video_id,
        v.title,
        v.channel_name,
        coalesce((
          select string_agg(coalesce(p.title, p.youtube_playlist_id), ', ' order by p.title)
          from playlist_videos pv
          join playlists p on p.id = pv.playlist_id
          where pv.video_id = v.id and pv.is_currently_member = true
        ), '') as playlists,
        count(distinct vss.collection_run_id)::int as hourly_total,
        count(distinct (vss.observed_at at time zone 'Asia/Seoul')::date)::int as daily_total
      from videos v
      join video_statistics_snapshots vss on vss.video_id = v.id
      group by v.id
      order by v.youtube_video_id
    `,
    sql`
      with run_points as (
        select distinct on (vss.video_id, vss.collection_run_id)
          vss.id as snapshot_id,
          vss.video_id,
          vss.collection_run_id,
          vss.observed_at,
          vss.view_count,
          vss.like_count,
          vss.comment_count
        from video_statistics_snapshots vss
        order by vss.video_id, vss.collection_run_id, vss.observed_at desc, vss.id desc
      ),
      with_changes as (
        select
          run_points.*,
          lag(view_count) over (partition by video_id order by observed_at asc, snapshot_id asc) as previous_view_count,
          lag(like_count) over (partition by video_id order by observed_at asc, snapshot_id asc) as previous_like_count,
          lag(comment_count) over (partition by video_id order by observed_at asc, snapshot_id asc) as previous_comment_count
        from run_points
      ),
      ranked as (
        select
          with_changes.*,
          row_number() over (partition by video_id order by observed_at desc, snapshot_id desc) as point_number
        from with_changes
      )
      select
        v.youtube_video_id,
        ranked.collection_run_id::text as collection_run_id,
        ranked.observed_at,
        ranked.view_count,
        ranked.view_count - ranked.previous_view_count as view_change,
        ranked.like_count,
        ranked.like_count - ranked.previous_like_count as like_change,
        ranked.comment_count,
        ranked.comment_count - ranked.previous_comment_count as comment_change
      from ranked
      join videos v on v.id = ranked.video_id
      where ranked.point_number > ${offset} and ranked.point_number <= ${offset + limit}
      order by v.youtube_video_id, ranked.observed_at desc, ranked.snapshot_id desc
    `,
    sql`
      with daily_points as (
        select distinct on (vss.video_id, (vss.observed_at at time zone 'Asia/Seoul')::date)
          vss.id as snapshot_id,
          vss.video_id,
          vss.observed_at,
          vss.view_count,
          vss.like_count,
          vss.comment_count,
          (vss.observed_at at time zone 'Asia/Seoul')::date as snapshot_date
        from video_statistics_snapshots vss
        order by
          vss.video_id,
          (vss.observed_at at time zone 'Asia/Seoul')::date,
          vss.observed_at asc,
          vss.id asc
      ),
      with_changes as (
        select
          daily_points.*,
          lag(view_count) over (partition by video_id order by snapshot_date asc, observed_at asc, snapshot_id asc) as previous_view_count,
          lag(like_count) over (partition by video_id order by snapshot_date asc, observed_at asc, snapshot_id asc) as previous_like_count,
          lag(comment_count) over (partition by video_id order by snapshot_date asc, observed_at asc, snapshot_id asc) as previous_comment_count
        from daily_points
      ),
      ranked as (
        select
          with_changes.*,
          row_number() over (partition by video_id order by snapshot_date desc, observed_at desc, snapshot_id desc) as point_number
        from with_changes
      )
      select
        v.youtube_video_id,
        to_char(ranked.snapshot_date, 'YYYY-MM-DD') as snapshot_date,
        ranked.observed_at,
        ranked.view_count,
        ranked.view_count - ranked.previous_view_count as view_change,
        ranked.like_count,
        ranked.like_count - ranked.previous_like_count as like_change,
        ranked.comment_count,
        ranked.comment_count - ranked.previous_comment_count as comment_change
      from ranked
      join videos v on v.id = ranked.video_id
      where ranked.point_number > ${offset} and ranked.point_number <= ${offset + limit}
      order by v.youtube_video_id, ranked.snapshot_date desc, ranked.observed_at desc
    `,
  ])

  const videos = new Map<string, VideoHistoryBundle>()

  for (const row of catalog) {
    const videoId = String(row.youtube_video_id)
    const hourlyTotal = Number(row.hourly_total ?? 0)
    const dailyTotal = Number(row.daily_total ?? 0)
    videos.set(videoId, {
      videoId,
      title: row.title == null ? null : String(row.title),
      channelName: row.channel_name == null ? null : String(row.channel_name),
      playlists: String(row.playlists ?? ""),
      hourly: [],
      daily: [],
      pagination: {
        hourly: { limit, offset, total: hourlyTotal, hasMore: offset + limit < hourlyTotal },
        daily: { limit, offset, total: dailyTotal, hasMore: offset + limit < dailyTotal },
      },
    })
  }

  for (const row of hourlyRows) {
    const video = videos.get(String(row.youtube_video_id))
    if (!video) continue
    video.hourly.push({
      observedAt: toIsoTimestamp(row.observed_at),
      collectionRunId: String(row.collection_run_id),
      viewCount: nullableNumber(row.view_count),
      viewChange: nullableNumber(row.view_change),
      likeCount: nullableNumber(row.like_count),
      likeChange: nullableNumber(row.like_change),
      commentCount: nullableNumber(row.comment_count),
      commentChange: nullableNumber(row.comment_change),
    })
  }

  for (const row of dailyRows) {
    const video = videos.get(String(row.youtube_video_id))
    if (!video) continue
    video.daily.push({
      observedAt: toIsoTimestamp(row.observed_at),
      snapshotDate: String(row.snapshot_date),
      viewCount: nullableNumber(row.view_count),
      viewChange: nullableNumber(row.view_change),
      likeCount: nullableNumber(row.like_count),
      likeChange: nullableNumber(row.like_change),
      commentCount: nullableNumber(row.comment_count),
      commentChange: nullableNumber(row.comment_change),
    })
  }

  return Array.from(videos.values())
}
