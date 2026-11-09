import { getToken } from "@vercel/connect"
import { NextResponse } from "next/server"

const connectorUid = "github/signalroom-collection-runner"
const repository = "915fss-cell/ytscrape"
const workflow = "collect.yml"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const maxResults = typeof body.maxResults === "number" && body.maxResults > 0 ? String(Math.floor(body.maxResults)) : ""
    const token = await getToken(connectorUid, { subject: { type: "app" } })
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: maxResults ? { max_results: maxResults } : {} }),
    })
    if (!response.ok) return NextResponse.json({ error: "GitHub could not start the collection workflow." }, { status: 502 })
    return NextResponse.json({ ok: true, message: "Collection workflow started on GitHub Actions." }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection workflow is not available." }, { status: 503 })
  }
}
