-- Meridian — initial schema
-- Apply via Supabase SQL editor or `supabase db push`.
-- Tables mirror server/store/json.js collections; columns use snake_case
-- and the supabase store maps them to camelCase on read.
--
-- Auth model: the application server is the privileged actor.
-- It uses the service role key (bypasses RLS), validates JWTs from the
-- frontend, and enforces user_id scoping in every query. RLS policies
-- below are defense-in-depth in case anyone ever points the anon key
-- at these tables directly.

-- ────────────────────────────────────────────────────────────────────
-- USERS — local identity, optionally linked to a Supabase auth.users id
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_users (
  id                bigserial primary key,
  email             text        not null unique,
  password_hash     text,                                   -- null when only OAuth
  supabase_user_id  text        unique,                     -- maps to auth.users(id)
  name              text,
  avatar_url        text,
  created_at        timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- PROVIDER KEYS — encrypted upstream API keys (anthropic / openai / google)
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_provider_keys (
  id              bigserial primary key,
  user_id         bigint      not null references meridian_users(id) on delete cascade,
  provider        text        not null,                  -- 'anthropic' | 'openai' | 'google' | 'mistral'
  label           text,
  prefix          text,                                   -- shown in UI; rest of key is encrypted
  encrypted_key   text        not null,                  -- AES-256-GCM ciphertext (base64)
  iv              text        not null,                  -- 12-byte IV (base64)
  auth_tag        text        not null,                  -- 16-byte tag (base64)
  created_at      timestamptz not null default now()
);
create index if not exists idx_provider_keys_user on meridian_provider_keys(user_id);

-- ────────────────────────────────────────────────────────────────────
-- TEAMS — buckets for spend attribution + budget caps
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_teams (
  id                  bigserial primary key,
  user_id             bigint      not null references meridian_users(id) on delete cascade,
  name                text        not null,
  monthly_budget_usd  numeric,                            -- null = no cap
  created_at          timestamptz not null default now()
);
create index if not exists idx_teams_user on meridian_teams(user_id);

-- ────────────────────────────────────────────────────────────────────
-- VIRTUAL KEYS — what apps actually use; rotate without touching providers
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_virtual_keys (
  id                  bigserial primary key,
  user_id             bigint      not null references meridian_users(id) on delete cascade,
  team_id             bigint      references meridian_teams(id) on delete set null,
  provider_key_id     bigint      references meridian_provider_keys(id) on delete cascade,
  label               text,
  prefix              text        not null,              -- e.g. "mk_live_…"
  key_hash            text        not null,              -- bcrypt of the rest of the key
  monthly_budget_usd  numeric,
  status              text        not null default 'active',  -- active | paused | revoked
  spent_mtd_usd       numeric     not null default 0,
  last_used_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_vkeys_user   on meridian_virtual_keys(user_id);
create index if not exists idx_vkeys_prefix on meridian_virtual_keys(prefix);

-- ────────────────────────────────────────────────────────────────────
-- AGENTS + RUNS — long-running sessions with loop-protection limits
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_agents (
  id                   bigserial primary key,
  user_id              bigint      not null references meridian_users(id) on delete cascade,
  team_id              bigint      references meridian_teams(id) on delete set null,
  name                 text        not null,
  description          text,
  status               text        not null default 'idle',   -- idle | running | paused
  max_run_cost_usd     numeric,
  max_loop_iterations  int,
  created_at           timestamptz not null default now()
);
create index if not exists idx_agents_user on meridian_agents(user_id);

create table if not exists meridian_agent_runs (
  id              bigserial primary key,
  user_id         bigint      not null references meridian_users(id) on delete cascade,
  agent_id        bigint      not null references meridian_agents(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          text        not null default 'running',
  request_count   int         not null default 0,
  cost_usd        numeric     not null default 0,
  iteration_count int         not null default 0,
  last_request_id bigint
);
create index if not exists idx_agent_runs_user  on meridian_agent_runs(user_id);
create index if not exists idx_agent_runs_agent on meridian_agent_runs(agent_id);

-- ────────────────────────────────────────────────────────────────────
-- ALERTS — thresholds + notification rules
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_alerts (
  id                 bigserial primary key,
  user_id            bigint      not null references meridian_users(id) on delete cascade,
  name               text        not null,
  type               text        not null,             -- team_budget | key_budget | agent_loop | spike
  target             jsonb,                            -- e.g. { teamId: 7 }
  threshold_usd      numeric,
  threshold_rpm      numeric,
  window_minutes     int,
  state              text        not null default 'active', -- active | triggered | paused
  last_triggered_at  timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists idx_alerts_user on meridian_alerts(user_id);

-- ────────────────────────────────────────────────────────────────────
-- REQUESTS — every routed AI call (this is the big one)
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_requests (
  id                bigserial primary key,
  user_id           bigint      not null references meridian_users(id) on delete cascade,
  virtual_key_id    bigint      references meridian_virtual_keys(id) on delete set null,
  team_id           bigint      references meridian_teams(id) on delete set null,
  agent_id          bigint      references meridian_agents(id) on delete set null,
  provider          text        not null,
  model             text        not null,
  prompt_tokens     int         not null default 0,
  completion_tokens int         not null default 0,
  latency_ms        int         not null default 0,
  cost_usd          numeric     not null default 0,
  status            text        not null default 'ok',  -- ok | error | rate_limited
  task_type         text,
  timestamp         timestamptz not null default now()
);
create index if not exists idx_requests_user_ts  on meridian_requests(user_id, timestamp desc);
create index if not exists idx_requests_vkey_ts  on meridian_requests(virtual_key_id, timestamp desc);
create index if not exists idx_requests_team_ts  on meridian_requests(team_id, timestamp desc);

-- ────────────────────────────────────────────────────────────────────
-- AUDIT LOG — every privileged action
-- ────────────────────────────────────────────────────────────────────
create table if not exists meridian_audit_log (
  id        bigserial primary key,
  user_id   bigint      references meridian_users(id) on delete cascade,
  action    text        not null,
  target    jsonb,
  meta      jsonb,
  ip        text,
  timestamp timestamptz not null default now()
);
create index if not exists idx_audit_user_ts on meridian_audit_log(user_id, timestamp desc);

-- ────────────────────────────────────────────────────────────────────
-- RLS — server uses service-role key (bypasses RLS), but enable them
-- as defense-in-depth so anon-key clients can't poke directly.
-- ────────────────────────────────────────────────────────────────────
alter table meridian_users          enable row level security;
alter table meridian_provider_keys  enable row level security;
alter table meridian_teams          enable row level security;
alter table meridian_virtual_keys   enable row level security;
alter table meridian_agents         enable row level security;
alter table meridian_agent_runs     enable row level security;
alter table meridian_alerts         enable row level security;
alter table meridian_requests       enable row level security;
alter table meridian_audit_log      enable row level security;

-- Default-deny for the anon role. Service role bypasses RLS entirely.
-- (No additional policies → effective behavior is "deny all" for anon.)
