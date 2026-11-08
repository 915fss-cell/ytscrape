"use client"

import { Plus, X } from "lucide-react"
import { useState } from "react"

export function AddPlaylistForm() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [message, setMessage] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState("saving")
    setMessage("")
    const response = await fetch("/api/playlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, title }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { setState("error"); setMessage(body.error || "Could not register playlist."); return }
    setState("saved")
    setMessage("Playlist registered. Refresh to see it in the overview.")
    setUrl(""); setTitle("")
  }

  if (!open) return <button className="button primary" onClick={() => setOpen(true)}><Plus size={15} /> Add playlist</button>
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><form className="modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">New source</div><h2>Register playlist</h2></div><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div><label>Playlist URL<input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/playlist?list=..." /></label><label>Display name <span>(optional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Product research" /></label>{message && <p className={state === "error" ? "form-error" : "form-success"}>{message}</p>}<button className="button primary full" disabled={state === "saving"}>{state === "saving" ? "Registering..." : "Register playlist"}</button></form></div>
}
