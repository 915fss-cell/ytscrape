"""Async PostgreSQL connection management for the analytics backend."""

from __future__ import annotations

import os
from typing import Any

import asyncpg


async def create_pool(
    dsn: str | None = None,
    *,
    min_size: int = 1,
    max_size: int = 10,
    **kwargs: Any,
) -> asyncpg.Pool:
    """Create an asyncpg pool using ``DATABASE_URL`` by default."""
    connection_string = dsn or os.environ.get("DATABASE_URL")
    if not connection_string:
        raise RuntimeError("DATABASE_URL is required to connect to Neon PostgreSQL.")
    return await asyncpg.create_pool(
        dsn=connection_string,
        min_size=min_size,
        max_size=max_size,
        **kwargs,
    )


async def close_pool(pool: asyncpg.Pool | None) -> None:
    """Close a pool when an application shuts down."""
    if pool is not None:
        await pool.close()


class Database:
    """Small lifecycle wrapper around an asyncpg connection pool."""

    def __init__(
        self,
        dsn: str | None = None,
        *,
        min_size: int = 1,
        max_size: int = 10,
        **kwargs: Any,
    ) -> None:
        self._dsn = dsn
        self._pool_options = {
            "min_size": min_size,
            "max_size": max_size,
            **kwargs,
        }
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> asyncpg.Pool:
        """Open and return the shared pool."""
        if self.pool is None:
            self.pool = await create_pool(self._dsn, **self._pool_options)
        return self.pool

    async def close(self) -> None:
        """Close the shared pool if it is open."""
        await close_pool(self.pool)
        self.pool = None

    async def __aenter__(self) -> asyncpg.Pool:
        return await self.connect()

    async def __aexit__(self, *_: object) -> None:
        await self.close()


__all__ = ["Database", "close_pool", "create_pool"]
