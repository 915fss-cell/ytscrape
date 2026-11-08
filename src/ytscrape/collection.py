"""Async collection orchestration for persisting playlist observations."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, Protocol

from .persistence import AnalyticsRepository


class AsyncPlaylistSource(Protocol):
    async def get_playlist(self, playlist: str) -> Any: ...

    def playlist_collection(
        self, playlists: object, *, max_results: int | None = None
    ) -> Any: ...


@dataclass(slots=True)
class CollectionResult:
    """Aggregate outcome of one collection run."""

    run_id: str
    playlists_requested: int
    playlists_succeeded: int = 0
    playlists_failed: int = 0
    videos_discovered: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)

    @property
    def status(self) -> str:
        if self.playlists_failed == 0:
            return "succeeded"
        if self.playlists_succeeded == 0:
            return "failed"
        return "partial"


class AsyncCollectionService:
    """Collect configured playlists and persist each complete enumeration."""

    def __init__(
        self,
        source: AsyncPlaylistSource,
        repository: AnalyticsRepository,
    ) -> None:
        self.source = source
        self.repository = repository

    async def collect(
        self,
        playlists: Iterable[str],
        *,
        max_results: int | None = None,
    ) -> CollectionResult:
        """Run a resilient collection batch for playlist URLs or IDs.

        Each playlist is committed independently. A failed playlist is recorded
        in the run's structured errors without discarding successful playlists.
        """
        playlist_values = list(playlists)
        run_id = await self.repository.start_run(len(playlist_values))
        result = CollectionResult(run_id, len(playlist_values))

        for playlist in playlist_values:
            try:
                details = await self.source.get_playlist(playlist)
                entries = self.source.playlist_collection(
                    [playlist], max_results=max_results
                )
                items = [entry async for entry in entries]
                count = await self.repository.save_playlist(
                    run_id,
                    details,
                    playlist,
                    items,
                )
                result.playlists_succeeded += 1
                result.videos_discovered += count
            except Exception as exc:
                result.playlists_failed += 1
                result.errors.append(
                    {
                        "playlist": playlist,
                        "error_type": type(exc).__name__,
                        "message": str(exc),
                    }
                )

        await self.repository.finish_run(
            run_id,
            status=result.status,
            playlists_succeeded=result.playlists_succeeded,
            playlists_failed=result.playlists_failed,
            videos_discovered=result.videos_discovered,
            errors=result.errors,
        )
        return result


__all__ = ["AsyncCollectionService", "CollectionResult"]
