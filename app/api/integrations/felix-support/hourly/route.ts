import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { isFelixSupportApiAuthorized } from "../../../../../lib/felix-support-api"

export const dynamic = "force-dynamic"

function parseInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null
}

export async function GET(request: Request) {
  const token = process.env.FELIX_SUPPORT_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Hourly data API is not configured." }, { status: 503 })
  }

  if (!isFelixSupportApiAuthorized(request, token)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    )
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Data source is unavailable." }, { status: 503 })
  }

  const url = new URL(request.url)
  const videoId = url.searchParams.get("videoId")
  if (videoId !== null && !/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) {
    return NextResponse.json({ error: "Invalid videoId." }, { status: 400 })
  }

  const limit = parseInteger(url.searchParams.get("limit"), 500, 500)
  const offset = parseInteger(url.searchParams.get("offset"), 0, 1000000)
  if (limit === null || limit < 1 || offset === null) {
    return NextResponse.json({ error: "Invalid pagination parameters." }, { status: 400 })
  }

  try {
    const sql = neon(process.env.DATABASE_URL)
    const rows = await sql`
      select
        count(*) over()::int as total_count,
        v.youtube_video_id,
        v.title,
        v.channel_name,
        coalesce((
          select string_agg(coalesce(p.title, p.youtube_playlist_id), ', ' order by p.title)
          from playlist_videos pv
          join playlists p on p.id = pv.playlist_id
          where pv.video_id = v.id and pv.is_currently_member = true
        ), '') as playlists,
        vss.observed_at,
        vss.view_count,
        vss.like_count,
        vss.comment_count
      from video_statistics_snapshots vss
      join videos v on v.id = vss.video_id
      where (${videoId}::text is null or v.youtube_video_id = ${videoId})
      order by vss.observed_at desc, v.youtube_video_id asc, vss.id desc
      limit ${limit}
      offset ${offset}
    `

    return NextResponse.json(
      {
        data: rows.map((row) => ({
          videoId: String(row.youtube_video_id),
          title: row.title == null ? null : String(row.title),
          channelName: row.channel_name == null ? null : String(row.channel_name),
          playlists: String(row.playlists ?? ""),
          observedAt: new Date(String(row.observed_at)).toISOString(),
          viewCount: row.view_count == null ? null : Number(row.view_count),
          likeCount: row.like_count == null ? null : Number(row.like_count),
          commentCount: row.comment_count == null ? null : Number(row.comment_count),
        })),
        pagination: {
          limit,
          offset,
          total: rows.length ? Number(rows[0].total_count) : 0,
          hasMore: rows.length === limit && offset + rows.length < Number(rows[0].total_count),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch {
    return NextResponse.json({ error: "Unable to retrieve hourly video data." }, { status: 500 })
  }
}
