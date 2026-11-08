from __future__ import annotations

import pytest

from ytscrape.collection import AsyncCollectionService
from ytscrape.database import Database
from ytscrape.models import PlaylistVideo, VideoDetails
from ytscrape.persistence import _duration_seconds, _video_values


@pytest.mark.parametrize(
    ("value", "expected"),
    [("1:02:03", 3723), ("02:05", 125), ("45", 45), (None, None), ("live", None)],
)
def test_duration_seconds(value: str | None, expected: int | None) -> None:
    assert _duration_seconds(value) == expected


def test_video_values_keep_missing_metrics_nullable() -> None:
    video = PlaylistVideo("video-id", "Video")
    values = _video_values(video, VideoDetails("video-id", views=None, is_private=True))
    assert values[0] == "video-id"
    assert values[8] is True


@pytest.mark.anyio
async def test_database_requires_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        await Database().connect()


class FakeRepository:
    def __init__(self) -> None:
        self.finished: dict[str, object] | None = None
        self.saved: list[str] = []
        self.failed: list[tuple[str, str]] = []

    async def record_playlist_failure(
        self, run_id: str, playlist_id: str, url: str, error: BaseException
    ) -> None:
        self.failed.append((playlist_id, str(error)))

    async def start_run(self, count: int) -> str:
        assert count == 2
        return "run-id"

    async def save_playlist(
        self, run_id: str, details: object, url: str, entries: list[object]
    ) -> int:
        assert run_id == "run-id"
        self.saved.append(url)
        return len(entries)

    async def finish_run(self, run_id: str, **kwargs: object) -> None:
        self.finished = {"run_id": run_id, **kwargs}


class FakeSource:
    def _normalize_playlist_id(self, value: str) -> str:
        return value

    async def get_playlist(self, playlist: str) -> object:
        if playlist == "bad":
            raise ValueError("unavailable")
        return object()

    def playlist_collection(
        self, playlists: object, *, max_results: int | None = None
    ) -> object:
        async def entries():
            yield object()
            yield object()

        return entries()


@pytest.mark.anyio
async def test_collection_service_isolates_playlist_failures() -> None:
    repository = FakeRepository()
    result = await AsyncCollectionService(FakeSource(), repository).collect(
        ["good", "bad"]
    )

    assert result.status == "partial"
    assert result.playlists_succeeded == 1
    assert result.playlists_failed == 1
    assert result.videos_discovered == 2
    assert repository.saved == ["good"]
    assert repository.finished is not None
    assert repository.finished["status"] == "partial"
