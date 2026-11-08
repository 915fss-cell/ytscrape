from __future__ import annotations

import asyncio
from typing import Any

import pytest

from ytscrape import (
    AsyncPlaylistCollection,
    ParseError,
    PlaylistDetails,
    PlaylistVideo,
    YouTube,
)
from ytscrape.async_results import AsyncPlaylistResults
from ytscrape.parsing import parse_playlist_details, parse_playlist_videos
from ytscrape.results import PlaylistCollection, PlaylistResults


def _page(entries: list[dict[str, Any]], token: str | None = None) -> dict[str, Any]:
    page: dict[str, Any] = {
        "contents": [{"playlistVideoRenderer": entry} for entry in entries]
    }
    if token is not None:
        page["continuationCommand"] = {"token": token}
    return page


def _entry(video_id: str, title: str | None = None) -> dict[str, Any]:
    return {"videoId": video_id, "title": {"simpleText": title or video_id}}


class FakeYouTube:
    def __init__(self, playlists: dict[str, list[PlaylistVideo] | Exception]) -> None:
        self.playlists = playlists

    @staticmethod
    def _normalize_playlist_id(value: str) -> str:
        return value

    def playlist(self, playlist_id: str, **_: Any) -> list[PlaylistVideo]:
        result = self.playlists[playlist_id]
        if isinstance(result, Exception):
            raise result
        return result


class AsyncFakeYouTube:
    def __init__(self, playlists: dict[str, list[PlaylistVideo] | Exception]) -> None:
        self.playlists = playlists

    @staticmethod
    def _normalize_playlist_id(value: str) -> str:
        return value

    async def playlist(self, playlist_id: str, **_: Any):
        result = self.playlists[playlist_id]
        if isinstance(result, Exception):
            raise result

        async def entries():
            for item in result:
                yield item

        return entries()


class SyncPageClient:
    def __init__(self, pages: list[dict[str, Any]]) -> None:
        self.pages = pages

    def browse(self, *_: Any, **__: Any) -> dict[str, Any]:
        return self.pages.pop(0) if self.pages else {}


class AsyncPageClient:
    def __init__(self, pages: list[dict[str, Any]]) -> None:
        self.pages = pages

    async def browse(self, *_: Any, **__: Any) -> dict[str, Any]:
        return self.pages.pop(0) if self.pages else {}


class TestPlaylistParsing:
    def test_playlist_id_normalization(self) -> None:
        assert YouTube._normalize_playlist_id("PLabc_123") == "PLabc_123"
        assert (
            YouTube._normalize_playlist_id(
                "https://www.youtube.com/playlist?list=PLabc_123"
            )
            == "PLabc_123"
        )

    def test_invalid_playlist_input(self) -> None:
        with pytest.raises(ParseError, match="Could not extract"):
            YouTube._normalize_playlist_id("https://youtu.be/video")

    def test_metadata_and_video_parsing(self) -> None:
        response = {
            "header": {
                "playlistHeaderRenderer": {
                    "title": {"simpleText": "Favorites"},
                }
            },
            "contents": [
                {"playlistVideoRenderer": _entry("v1", "First")},
            ],
        }
        details = parse_playlist_details(response, "PL1")
        assert isinstance(details, PlaylistDetails)
        assert details.title == "Favorites"
        assert parse_playlist_videos(response)[0].title == "First"


class TestPlaylistPagination:
    def test_pages_and_empty_playlist(self) -> None:
        client = SyncPageClient([_page([_entry("v2")])])
        results = PlaylistResults(client, _page([_entry("v1")], "T1"))
        assert [item.video_id for item in results] == ["v1", "v2"]
        assert list(PlaylistResults(AsyncPageClient([]), _page([]))) == []

    def test_repeated_token_stops(self) -> None:
        client = SyncPageClient([_page([_entry("v2")], "T1")])
        results = PlaylistResults(client, _page([_entry("v1")], "T1"))
        assert [item.video_id for item in results] == ["v1", "v2"]


class TestPlaylistCollection:
    def test_complete_duplicate_associations_and_failures(self) -> None:
        def video(value: str) -> PlaylistVideo:
            return PlaylistVideo(video_id=value, title=value)

        yt = FakeYouTube(
            {
                "PL1": [video("v1"), video("v2")],
                "PL2": [video("v1")],
                "PL3": RuntimeError("blocked"),
            }
        )
        collection = PlaylistCollection(yt, ["PL1", "PL2", "PL3"])
        values = list(collection)
        assert [(item.video_id, item.playlist_ids) for item in values] == [
            ("v1", ("PL1", "PL2")),
            ("v2", ("PL1",)),
        ]
        assert "PL3" in collection.failures

    def test_max_results_is_aggregate(self) -> None:
        def video(value: str) -> PlaylistVideo:
            return PlaylistVideo(video_id=value, title=value)

        yt = FakeYouTube({"PL1": [video("v1"), video("v2")]})
        values = PlaylistCollection(yt, ["PL1"], max_results=1)
        assert [item.video_id for item in values] == ["v1"]

    def test_three_playlists_preserve_all_duplicate_associations(self) -> None:
        video = PlaylistVideo(video_id="v1", title="Shared")
        yt = FakeYouTube({"PL1": [video], "PL2": [video], "PL3": [video]})
        values = list(PlaylistCollection(yt, ["PL1", "PL2", "PL3"]))
        assert len(values) == 1
        assert values[0].playlist_ids == ("PL1", "PL2", "PL3")


class TestAsyncPlaylistCollection:
    def test_async_result_pagination(self) -> None:
        async def body() -> None:
            client = AsyncPageClient([_page([_entry("v2")])])
            results = AsyncPlaylistResults(client, _page([_entry("v1")], "T1"))
            assert [item.video_id async for item in results] == ["v1", "v2"]

        asyncio.run(body())

    def test_three_playlists_preserve_all_duplicate_associations(self) -> None:
        async def body() -> None:
            video = PlaylistVideo(video_id="v1", title="Shared")

            class AsyncFake:
                @staticmethod
                def _normalize_playlist_id(value: str) -> str:
                    return value

                async def playlist(self, playlist_id: str, **_: Any) -> Any:
                    return _AsyncItems([video])

            values = [
                item
                async for item in AsyncPlaylistCollection(
                    AsyncFake(), ["PL1", "PL2", "PL3"]
                )
            ]
            assert len(values) == 1
            assert values[0].playlist_ids == ("PL1", "PL2", "PL3")

        asyncio.run(body())

    def test_pagination_and_duplicate_associations_and_failure(self) -> None:
        async def body() -> None:
            def video(value: str) -> PlaylistVideo:
                return PlaylistVideo(video_id=value, title=value)

            class AsyncFake:
                @staticmethod
                def _normalize_playlist_id(value: str) -> str:
                    return value

                async def playlist(self, playlist_id: str, **_: Any) -> Any:
                    if playlist_id == "PL3":
                        raise RuntimeError("blocked")
                    items = (
                        [video("v1"), video("v2")]
                        if playlist_id == "PL1"
                        else [video("v1")]
                    )
                    return _AsyncItems(items)

            collection = AsyncPlaylistCollection(AsyncFake(), ["PL1", "PL2", "PL3"])
            values = [item async for item in collection]
            assert [(item.video_id, item.playlist_ids) for item in values] == [
                ("v1", ("PL1", "PL2")),
                ("v2", ("PL1",)),
            ]
            assert "PL3" in collection.failures

        asyncio.run(body())


class _AsyncItems:
    def __init__(self, items: list[PlaylistVideo]) -> None:
        self.items = items

    def __aiter__(self):
        async def iterate():
            for item in self.items:
                yield item

        return iterate()
