create extension if not exists pgcrypto;

create type collection_run_status as enum ('running', 'succeeded', 'partial', 'failed');
create type milestone_status as enum ('reached', 'retracted');

create table playlists (
  id uuid primary key default gen_random_uuid(),
  youtube_playlist_id text not null unique,
  url text not null,
  title text,
  description text,
  thumbnail_url text,
  is_active boolean not null default true,
  added_at timestamptz not null default now(),
  last_successful_collection_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(youtube_playlist_id)) > 0),
  check (length(trim(url)) > 0)
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text not null unique,
  title text,
  thumbnail_url text,
  channel_name text,
  youtube_channel_id text,
  duration_seconds integer,
  published_at timestamptz,
  description text,
  is_unavailable boolean not null default false,
  unavailable_reason text,
  first_seen_at timestamptz not null default now(),
  last_metadata_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_seconds is null or duration_seconds >= 0),
  check (length(trim(youtube_video_id)) > 0)
);

create table playlist_videos (
  playlist_id uuid not null references playlists(id),
  video_id uuid not null references videos(id),
  first_discovered_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  is_currently_member boolean not null default true,
  removed_at timestamptz,
  primary key (playlist_id, video_id),
  check ((is_currently_member and removed_at is null) or (not is_currently_member and removed_at is not null))
);

create table collection_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status collection_run_status not null default 'running',
  playlists_requested integer not null default 0,
  playlists_succeeded integer not null default 0,
  playlists_failed integer not null default 0,
  videos_discovered integer not null default 0,
  videos_updated integer not null default 0,
  statistics_collected integer not null default 0,
  failures_count integer not null default 0,
  error_details jsonb,
  check (completed_at is null or completed_at >= started_at),
  check (playlists_requested >= 0 and playlists_succeeded >= 0 and playlists_failed >= 0),
  check (videos_discovered >= 0 and videos_updated >= 0 and statistics_collected >= 0 and failures_count >= 0)
);

create table collection_run_playlists (
  collection_run_id uuid not null references collection_runs(id) on delete cascade,
  playlist_id uuid not null references playlists(id),
  status collection_run_status not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  videos_discovered integer not null default 0,
  videos_updated integer not null default 0,
  error_details jsonb,
  primary key (collection_run_id, playlist_id)
);

create table video_statistics_snapshots (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id),
  collection_run_id uuid not null references collection_runs(id),
  observed_at timestamptz not null default now(),
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  favorite_count bigint,
  is_live boolean,
  raw_statistics jsonb,
  unique (video_id, collection_run_id),
  check (view_count is null or view_count >= 0),
  check (like_count is null or like_count >= 0),
  check (comment_count is null or comment_count >= 0),
  check (favorite_count is null or favorite_count >= 0)
);

create table milestone_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  metric text not null default 'view_count',
  threshold bigint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (metric in ('view_count', 'like_count', 'comment_count')),
  check (threshold > 0)
);

create table video_milestones (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id),
  milestone_definition_id uuid not null references milestone_definitions(id),
  snapshot_id uuid not null references video_statistics_snapshots(id),
  reached_at timestamptz not null,
  reached_value bigint not null,
  status milestone_status not null default 'reached',
  created_at timestamptz not null default now(),
  unique (video_id, milestone_definition_id),
  check (reached_value >= 0)
);

create index idx_playlists_active on playlists (is_active) where is_active;
create index idx_playlist_videos_current on playlist_videos (playlist_id, last_observed_at desc) where is_currently_member;
create index idx_playlist_videos_video on playlist_videos (video_id, last_observed_at desc);
create index idx_videos_channel on videos (youtube_channel_id) where youtube_channel_id is not null;
create index idx_videos_last_refresh on videos (last_metadata_refresh_at);
create index idx_runs_started on collection_runs (started_at desc);
create index idx_run_playlists_status on collection_run_playlists (collection_run_id, status);
create index idx_stats_video_time on video_statistics_snapshots (video_id, observed_at desc);
create index idx_stats_time on video_statistics_snapshots (observed_at desc);
create index idx_milestones_video_time on video_milestones (video_id, reached_at desc);
