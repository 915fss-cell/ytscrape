from __future__ import annotations

import asyncio
from dataclasses import dataclass

from ytscrape.__main__ import _build_parser
from ytscrape.collection import AsyncCollectionService
from ytscrape.models import PlaylistDetails, PlaylistVideo, VideoDetails


@dataclass
class FakeRepository:
    run_id: str = "run-1"
    saved: list[str] = None  # type: ignore[assignment]
    snapshots: int = 0

    def __post_init__(self) -> None:
        self.saved = []

    async def start_run(self, playlists_requested: int) -> str:
        assert playlists_requested == 1
        return self.run_id

    async def existing_video_ids(self, video_ids: list[str]) -> set[str]:
        return {"old-video"} & set(video_ids)

    async def save_playlist(
        self,
        run_id: str,
        details: PlaylistDetails,
        url: str,
        entries: list[PlaylistVideo],
    ) -> int:
        self.saved.extend(entry.video_id for entry in entries)
        return len(entries)

    async def record_statistics(
        self, run_id: str, video_id: str, details: VideoDetails
    ) -> str:
        self.snapshots += 1
        return f"snapshot-{video_id}"

    async def evaluate_milestones(
        self,
        video_id: str,
        snapshot_id: str,
        metrics: dict[str, int | None],
    ) -> int:
        return 1 if metrics.get("view_count", 0) >= 100 else 0

    async def record_playlist_failure(
        self, run_id: str, playlist_id: str, url: str, error: BaseException
    ) -> None:
        raise AssertionError(error)

    async def finish_run(self, run_id: str, **kwargs: object) -> None:
        assert kwargs["statistics_collected"] == self.snapshots


class FakeSource:
    def _normalize_playlist_id(self, value: str) -> str:
        return value

    async def get_playlist(self, playlist: str) -> PlaylistDetails:
        return PlaylistDetails("PL-test", "Test playlist")

    def playlist_collection(self, playlists: object, *, max_results: int | None = None):
        async def entries():
            yield PlaylistVideo("old-video", "Old")
            yield PlaylistVideo("new-video", "New")

        return entries()

    async def video(self, video: str) -> VideoDetails:
        return VideoDetails(video, title=video, views=100)


def test_collection_service_collects_statistics_and_counts_new_videos() -> None:
    repository = FakeRepository()
    result = asyncio.run(
        AsyncCollectionService(FakeSource(), repository).collect(
            ["PL-test"], collect_statistics=True
        )
    )

    assert result.status == "succeeded"
    assert result.videos_discovered == 2
    assert result.new_videos == 1
    assert result.statistics_collected == 2
    assert result.milestones_reached == 2
    assert repository.saved == ["old-video", "new-video"]


def test_collect_command_parser() -> None:
    args = _build_parser().parse_args(["collect", "--max", "25"])
    assert args.command == "collect"
    assert args.max_results == 25
