import { NextResponse } from "next/server"
import { getFelixSupportVideoHistory } from "../../../../../lib/felix-support-video-history"
import { getTotalViewsHistory } from "../../../../../lib/total-views"
import { isFelixSupportApiAuthorized } from "../../../../../lib/felix-support-api"

export const dynamic = "force-dynamic"

function parseInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null
}

function includeChanges<T extends { totalViews: number }>(records: T[]) {
  return records.map((record, index) => ({
    ...record,
    changeFromPrevious: records[index + 1]
      ? record.totalViews - records[index + 1].totalViews
      : null,
  }))
}

export async function GET(request: Request) {
  const token = process.env.FELIX_SUPPORT_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: "Total views API is not configured." }, { status: 503 })
  }

  if (!isFelixSupportApiAuthorized(request, token)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    )
  }

  const url = new URL(request.url)
  const historyLimit = parseInteger(url.searchParams.get("historyLimit"), 500, 500)
  const historyOffset = parseInteger(url.searchParams.get("historyOffset"), 0, 1000000)
  if (historyLimit === null || historyLimit < 1 || historyOffset === null) {
    return NextResponse.json({ error: "Invalid history pagination parameters." }, { status: 400 })
  }

  try {
    const [hourlyHistory, dailyHistory, videos] = await Promise.all([
      getTotalViewsHistory("hourly"),
      getTotalViewsHistory("daily"),
      getFelixSupportVideoHistory(historyLimit, historyOffset),
    ])

    if (!hourlyHistory.connected || !dailyHistory.connected) {
      return NextResponse.json({ error: "Unable to retrieve total views history." }, { status: 503 })
    }

    const hourly = includeChanges(hourlyHistory.records)
    const daily = includeChanges(dailyHistory.records)

    return NextResponse.json(
      {
        timeZone: "Asia/Seoul",
        order: "newest-first",
        totals: { hourly, daily },
        hourly,
        daily,
        videos,
        videoHistoryPagination: { limit: historyLimit, offset: historyOffset },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch {
    return NextResponse.json({ error: "Unable to retrieve total and per-video history." }, { status: 503 })
  }
}
