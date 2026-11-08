from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

from ytscrape.models import PlaylistDetails, PlaylistVideo, VideoDetails
from ytscrape.persistence import AnalyticsRepository

pytestmark = pytest.mark.integration


@pytest.fixture
async def repository() -> tuple[AnalyticsRepository, asyncpg.Pool]:
    dsn = os.getenv("YTSCRAPE_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("YTSCRAPE_TEST_DATABASE_URL is not configured")
    pool = await asyncpg.create_pool(dsn)
    try:
        yield AnalyticsRepository(pool), pool
    finally:
        await pool.close()


@pytest.mark.anyio
async def test_membership_reconciliation_and_video_deduplication(repository) -> None:
    repo, pool = repository
    suffix = uuid.uuid4().hex
    playlist_a = PlaylistDetails(f"PL{suffix}a", "A")
    playlist_b = PlaylistDetails(f"PL{suffix}b", "B")
    entry = PlaylistVideo(f"v{suffix}", "Video")
    run_id = await repo.start_run(2)

    assert await repo.save_playlist(run_id, playlist_a, playlist_a.url, [entry]) == 1
    assert await repo.save_playlist(run_id, playlist_b, playlist_b.url, [entry]) == 1
    assert await repo.save_playlist(run_id, playlist_a, playlist_a.url, []) == 0

    membership = await pool.fetchrow(
        """
        select pv.is_currently_member, pv.removed_at
        from playlist_videos pv join playlists p on p.id = pv.playlist_id
        where p.youtube_playlist_id = $1
        """,
        playlist_a.playlist_id,
    )
    assert membership["is_currently_member"] is False
    assert membership["removed_at"] is not None

    counts = await pool.fetchrow(
        "select count(*) as videos from videos where youtube_video_id = $1",
        entry.video_id,
    )
    assert counts["videos"] == 1


@pytest.mark.anyio
async def test_statistics_snapshot_is_idempotent_and_nullable(repository) -> None:
    repo, pool = repository
    suffix = uuid.uuid4().hex
    playlist = PlaylistDetails(f"PL{suffix}", "Stats")
    entry = PlaylistVideo(f"v{suffix}", "Video")
    run_id = await repo.start_run(1)
    await repo.save_playlist(run_id, playlist, playlist.url, [entry])

    details = VideoDetails(entry.video_id, views=123)
    first = await repo.record_statistics(run_id, entry.video_id, details)
    second = await repo.record_statistics(run_id, entry.video_id, details)
    assert first == second

    row = await pool.fetchrow(
        """
        select view_count, like_count, comment_count
        from video_statistics_snapshots s join videos v on v.id = s.video_id
        where v.youtube_video_id = $1 and s.collection_run_id = $2
        """,
        entry.video_id,
        run_id,
    )
    assert row["view_count"] == 123
    assert row["like_count"] is None
    assert row["comment_count"] is None
