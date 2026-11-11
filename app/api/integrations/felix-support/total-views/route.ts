import { NextResponse } from "next/server"
import { getTotalViewsHistory } from "../../../../../lib/total-views"
import { isFelixSupportApiAuthorized } from "../../../../../lib/felix-support-api"

export const dynamic = "force-dynamic"

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

  const [hourlyHistory, dailyHistory] = await Promise.all([
    getTotalViewsHistory("hourly"),
    getTotalViewsHistory("daily"),
  ])

  if (!hourlyHistory.connected || !dailyHistory.connected) {
    return NextResponse.json({ error: "Unable to retrieve total views history." }, { status: 503 })
  }

  return NextResponse.json(
    {
      timeZone: "Asia/Seoul",
      order: "newest-first",
      hourly: includeChanges(hourlyHistory.records),
      daily: includeChanges(dailyHistory.records),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
