import { neon } from "@neondatabase/serverless"

export type TotalViewsMode = "hourly" | "daily"

export type TotalViewsRecord = {
  id: string
  observedAt: string
  snapshotDate: string | null
  totalViews: number
  videosIncluded: number
}

export type TotalViewsHistory = {
  connected: boolean
  connectionError?: string
  records: TotalViewsRecord[]
}

export async function getTotalViewsHistory(mode: TotalViewsMode): Promise<TotalViewsHistory> {
  if (!process.env.DATABASE_URL) {
    return { connected: false, connectionError: "DATABASE_URL is not configured.", records: [] }
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = mode === "hourly"
      ? await sql`
          with run_video_snapshots as (
            select distinct on (vss.collection_run_id, vss.video_id)
              vss.collection_run_id,
              vss.video_id,
              vss.observed_at,
              vss.view_count
            from video_statistics_snapshots vss
            order by vss.collection_run_id, vss.video_id, vss.observed_at desc, vss.id desc
          )
          select
            cr.id::text as id,
            min(vss.observed_at) as observed_at,
            null::text as snapshot_date,
            coalesce(sum(vss.view_count), 0)::numeric as total_views,
            count(distinct vss.video_id)::int as videos_included
          from collection_runs cr
          join run_video_snapshots vss on vss.collection_run_id = cr.id
          group by cr.id
          order by min(vss.observed_at) desc
          limit 500
        `
      : await sql`
          with daily_video_baselines as (
            select distinct on (vss.video_id, (vss.observed_at at time zone 'Asia/Seoul')::date)
              vss.id,
              vss.video_id,
              vss.observed_at,
              vss.view_count,
              (vss.observed_at at time zone 'Asia/Seoul')::date as snapshot_date
            from video_statistics_snapshots vss
            order by
              vss.video_id,
              (vss.observed_at at time zone 'Asia/Seoul')::date,
              vss.observed_at asc,
              vss.id asc
          )
          select
            snapshot_date::text as id,
            min(observed_at) as observed_at,
            to_char(snapshot_date, 'YYYY-MM-DD') as snapshot_date,
            coalesce(sum(view_count), 0)::numeric as total_views,
            count(distinct video_id)::int as videos_included
          from daily_video_baselines
          group by snapshot_date
          order by snapshot_date desc
          limit 500
        `

    return {
      connected: true,
      records: rows.map((row) => ({
        id: String(row.id),
        observedAt: new Date(String(row.observed_at)).toISOString(),
        snapshotDate: row.snapshot_date == null ? null : String(row.snapshot_date),
        totalViews: Number(row.total_views ?? 0),
        videosIncluded: Number(row.videos_included ?? 0),
      })),
    }
  } catch (error) {
    return {
      connected: false,
      connectionError: error instanceof Error ? error.message : "Unable to reach Neon.",
      records: [],
    }
  }
}
