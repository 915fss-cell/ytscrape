import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const url = typeof body.url === "string" ? body.url.trim() : ""
    const title = typeof body.title === "string" ? body.title.trim() || null : null
    const playlistId = new URL(url).searchParams.get("list")
    if (!playlistId || !/^[A-Za-z0-9_-]{6,}$/.test(playlistId)) return NextResponse.json({ error: "Enter a valid YouTube playlist URL." }, { status: 400 })
    if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 500 })
    const sql = neon(process.env.DATABASE_URL)
    await sql`
      insert into playlists (youtube_playlist_id, url, title)
      values (${playlistId}, ${url}, ${title})
      on conflict (youtube_playlist_id) do update set
        url = excluded.url,
        title = coalesce(excluded.title, playlists.title),
        is_active = true,
        updated_at = now()
    `
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Could not register playlist. Check the URL and database connection." }, { status: 400 })
  }
}
