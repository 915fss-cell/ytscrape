"""Persistence primitives for YouTube collection runs.

The repository deliberately accepts an asyncpg pool rather than owning a global
connection. Applications can share one pool across their scraper and API.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

import asyncpg

from .models import PlaylistDetails, PlaylistVideo, VideoDetails


class AnalyticsRepository:
    """Store playlists, videos, memberships, snapshots, and milestones."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def start_run(self, playlists_requested: int) -> str:
        """Create a running collection batch and return its UUID as a string."""
        row = await self.pool.fetchrow(
            """
            insert into collection_runs (playlists_requested)
            values ($1)
            returning id::text
            """,
            playlists_requested,
        )
        if row is None:
            raise RuntimeError("Could not create collection run.")
        return str(row["id"])

    async def upsert_playlist(
        self,
        details: PlaylistDetails,
        url: str,
        *,
        conn: asyncpg.Connection | None = None,
    ) -> str:
        """Insert or update playlist metadata without overwriting with nulls."""
        executor = conn or self.pool
        row = await executor.fetchrow(
            """
            insert into playlists (
                youtube_playlist_id, url, title, thumbnail_url
            ) values ($1, $2, $3, $4)
            on conflict (youtube_playlist_id) do update set
                url = excluded.url,
                title = coalesce(excluded.title, playlists.title),
                thumbnail_url = coalesce(
                    excluded.thumbnail_url, playlists.thumbnail_url
                ),
                updated_at = now()
            returning id::text
            """,
            details.playlist_id,
            url,
            details.title,
            details.thumbnail,
        )
        if row is None:
            raise RuntimeError("Could not upsert playlist.")
        return str(row["id"])

    async def upsert_video(
        self,
        video: PlaylistVideo,
        *,
        details: VideoDetails | None = None,
        conn: asyncpg.Connection | None = None,
    ) -> str:
        """Upsert a canonical video row, preserving existing non-null metadata."""
        executor = conn or self.pool
        values = _video_values(video, details)
        row = await executor.fetchrow(
            """
            insert into videos (
                youtube_video_id, title, thumbnail_url, channel_name,
                youtube_channel_id, duration_seconds, published_at,
                description, is_unavailable, unavailable_reason,
                last_metadata_refresh_at
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            on conflict (youtube_video_id) do update set
                title = coalesce(excluded.title, videos.title),
                thumbnail_url = coalesce(excluded.thumbnail_url, videos.thumbnail_url),
                channel_name = coalesce(excluded.channel_name, videos.channel_name),
                youtube_channel_id = coalesce(
                    excluded.youtube_channel_id, videos.youtube_channel_id
                ),
                duration_seconds = coalesce(
                    excluded.duration_seconds, videos.duration_seconds
                ),
                published_at = coalesce(
                    excluded.published_at, videos.published_at
                ),
                description = coalesce(excluded.description, videos.description),
                is_unavailable = excluded.is_unavailable,
                unavailable_reason = coalesce(
                    excluded.unavailable_reason, videos.unavailable_reason
                ),
                last_metadata_refresh_at = coalesce(
                    excluded.last_metadata_refresh_at,
                    videos.last_metadata_refresh_at
                ),
                updated_at = now()
            returning id::text
            """,
            *values,
        )
        if row is None:
            raise RuntimeError("Could not upsert video.")
        return str(row["id"])

    async def save_playlist(
        self,
        run_id: str,
        details: PlaylistDetails,
        url: str,
        entries: Iterable[PlaylistVideo],
        *,
        video_details: Mapping[str, VideoDetails] | None = None,
    ) -> int:
        """Persist one complete playlist enumeration atomically.

        Membership removal is reconciled only after every entry has been written.
        Callers should not use this method for partial or failed enumerations.
        """
        items = list(entries)
        fetched_details = video_details or {}
        async with self.pool.acquire() as conn, conn.transaction():
            playlist_id = await self.upsert_playlist(details, url, conn=conn)
            await conn.execute(
                """
                    insert into collection_run_playlists
                        (collection_run_id, playlist_id)
                    values ($1, $2)
                    on conflict (collection_run_id, playlist_id) do update set
                        status = 'running', started_at = now(), completed_at = null,
                        error_details = null
                    """,
                run_id,
                playlist_id,
            )
            seen_ids: set[str] = set()
            for entry in items:
                if not entry.video_id:
                    continue
                seen_ids.add(entry.video_id)
                video_id = await self.upsert_video(
                    entry,
                    details=fetched_details.get(entry.video_id),
                    conn=conn,
                )
                await conn.execute(
                    """
                        insert into playlist_videos (playlist_id, video_id)
                        values ($1, $2)
                        on conflict (playlist_id, video_id) do update set
                            last_observed_at = now(),
                            is_currently_member = true,
                            removed_at = null
                        """,
                    playlist_id,
                    video_id,
                )
            if seen_ids:
                await conn.execute(
                    """
                        update playlist_videos pv
                        set is_currently_member = false, removed_at = now()
                        from videos v
                        where pv.playlist_id = $1
                          and pv.video_id = v.id
                          and pv.is_currently_member = true
                          and v.youtube_video_id <> all($2::text[])
                        """,
                    playlist_id,
                    list(seen_ids),
                )
            await conn.execute(
                """
                    update playlists
                    set last_successful_collection_at = now(),
                        last_error_at = null, last_error = null, updated_at = now()
                    where id = $1
                    """,
                playlist_id,
            )
            await conn.execute(
                """
                    update collection_run_playlists
                    set status = 'succeeded', completed_at = now(),
                        videos_discovered = $3
                    where collection_run_id = $1 and playlist_id = $2
                    """,
                run_id,
                playlist_id,
                len(seen_ids),
            )
        return len(seen_ids)

    async def record_statistics(
        self,
        run_id: str,
        video_id: str,
        details: VideoDetails,
        *,
        raw_statistics: Mapping[str, Any] | None = None,
    ) -> str:
        """Insert one idempotent statistics snapshot for a run."""
        row = await self.pool.fetchrow(
            """
            insert into video_statistics_snapshots (
                video_id, collection_run_id, view_count, like_count,
                comment_count, favorite_count, is_live, raw_statistics
            )
            select v.id, $2, $3, $4, $5, null, $6, $7::jsonb
            from videos v
            where v.youtube_video_id = $1
            on conflict (video_id, collection_run_id) do update set
                view_count = excluded.view_count,
                like_count = excluded.like_count,
                comment_count = excluded.comment_count,
                is_live = excluded.is_live,
                raw_statistics = excluded.raw_statistics,
                observed_at = now()
            returning id::text
            """,
            video_id,
            run_id,
            details.views,
            None,
            None,
            details.is_live,
            json.dumps(dict(raw_statistics)) if raw_statistics is not None else None,
        )
        if row is None:
            raise ValueError(f"Video {video_id!r} is not registered.")
        return str(row["id"])

    async def finish_run(
        self,
        run_id: str,
        *,
        status: str,
        playlists_succeeded: int,
        playlists_failed: int,
        videos_discovered: int = 0,
        videos_updated: int = 0,
        statistics_collected: int = 0,
        errors: Sequence[Mapping[str, Any]] | None = None,
    ) -> None:
        """Close a collection run with aggregate counters and structured errors."""
        if status not in {"succeeded", "partial", "failed"}:
            raise ValueError("status must be succeeded, partial, or failed")
        await self.pool.execute(
            """
            update collection_runs
            set completed_at = now(), status = $2,
                playlists_succeeded = $3, playlists_failed = $4,
                videos_discovered = $5, videos_updated = $6,
                statistics_collected = $7, failures_count = $8,
                error_details = $9::jsonb
            where id = $1
            """,
            run_id,
            status,
            playlists_succeeded,
            playlists_failed,
            videos_discovered,
            videos_updated,
            statistics_collected,
            len(errors or []),
            json.dumps(errors) if errors else None,
        )


def _video_values(
    video: PlaylistVideo, details: VideoDetails | None
) -> tuple[Any, ...]:
    """Map scraper models to nullable database values."""
    published_at = details.published_at or details.uploaded_at if details else None
    return (
        video.video_id,
        details.title if details and details.title else video.title,
        details.thumbnail if details and details.thumbnail else video.thumbnail,
        details.channel if details else video.channel_title,
        details.channel_id if details else video.channel_id,
        details.length_seconds if details else _duration_seconds(video.duration),
        published_at,
        details.description if details else None,
        video.is_unavailable or bool(details and details.is_private),
        video.unavailable_reason,
        datetime.now(timezone.utc) if details else None,
    )


def _duration_seconds(value: str | None) -> int | None:
    if not value:
        return None
    parts = value.split(":")
    if not all(part.isdigit() for part in parts):
        return None
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + int(part)
    return seconds


__all__ = ["AnalyticsRepository"]
