"use client"

import { Play } from "lucide-react"
import { useState } from "react"

export function CollectButton() {
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle")
  const [message, setMessage] = useState("")
  async function startCollection() {
    setState("starting")
    setMessage("")
    const response = await fetch("/api/collect", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { setState("error"); setMessage(body.error || "Could not start collection."); return }
    setState("started")
    setMessage(body.message || "Collection started.")
  }
  return <div className="collect-control"><button className="button primary" onClick={startCollection} disabled={state === "starting"}><Play size={14} /> {state === "starting" ? "Starting..." : state === "started" ? "Collection started" : "Collect now"}</button>{message && <span className={state === "error" ? "collect-error" : "collect-success"} role="status">{message}</span>}</div>
}
