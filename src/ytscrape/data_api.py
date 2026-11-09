"""Small YouTube Data API v3 client used for quota-efficient statistics reads."""

from __future__ import annotations

from typing import Any

import httpx

from .models import VideoDetails


class YouTubeDataAPI:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30)

    async def statistics(
        self, video_ids: list[str]
    ) -> dict[str, tuple[VideoDetails, int | None, int | None, dict[str, Any]]]:
        results: dict[
            str, tuple[VideoDetails, int | None, int | None, dict[str, Any]]
        ] = {}
        for start in range(0, len(video_ids), 50):
            batch = video_ids[start : start + 50]
            response = await self.client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "snippet,statistics",
                    "id": ",".join(batch),
                    "key": self.api_key,
                },
            )
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("items", []):
                video_id = item["id"]
                stats = item.get("statistics", {})
                snippet = item.get("snippet", {})
                results[video_id] = (
                    VideoDetails(
                        video_id=video_id,
                        title=snippet.get("title"),
                        views=_integer(stats.get("viewCount")),
                    ),
                    _integer(stats.get("likeCount")),
                    _integer(stats.get("commentCount")),
                    stats,
                )
        return results

    async def aclose(self) -> None:
        await self.client.aclose()


def _integer(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
