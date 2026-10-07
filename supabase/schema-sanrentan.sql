-- ===== テーブル =====
create table if not exists public.derby_games (
id text primary key default 'derby_current',
current_race_index int not null default 0 check (current_race_index between
0 and 2),
status text not null default 'idle'
check (status in ('idle', 'racing', 'result', 'grand_finale')),
correct_order int[] not null default array[6, 4, 0]
check (array_length(correct_order, 1) = 3),
updated_at timestamptz not null default now()
);
create table if not exists public.derby_races (
id text primary key,
round_index int not null unique check (round_index between 0 and 2),
name text not null,
question text not null,
options text[] not null check (array_length(options, 1) = 8),
correct_order int[] not null default array[0, 1, 2]
check (array_length(correct_order, 1) = 3),
updated_at timestamptz not null default now()
);
create table if not exists public.derby_participants (
id text primary key,
name text not null check (char_length(name) between 1 and 30),
score int not null default 0,
updated_at timestamptz not null default now()
);
create table if not exists public.derby_bets (
id uuid primary key default gen_random_uuid(),
game_id text not null default 'derby_current',
race_index int not null check (race_index between 0 and 2),
participant_id text not null references public.derby_participants(id) on
delete cascade,
participant_name text not null,
bet_order int[] not null check (array_length(bet_order, 1) = 3),
score_gained int not null default 0,
created_at timestamptz not null default now(),
constraint unique_participant_per_race unique (game_id, race_index,
participant_id)
);
-- 進行状態は1行だけ持つ
insert into public.derby_games (id) values ('derby_current')
on conflict (id) do nothing;
-- ===== Realtime（再実行してもエラーにならない） =====
do $$
declare t text;

begin
foreach t in array array['derby_games', 'derby_races',
'derby_participants', 'derby_bets'] loop
if not exists (
select 1 from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and
tablename = t
) then
execute format('alter publication supabase_realtime add table
public.%I', t);
end if;
end loop;
end $$;
-- ===== RLS =====
alter table public.derby_games enable row level security;
alter table public.derby_races enable row level security;
alter table public.derby_participants enable row level security;
alter table public.derby_bets enable row level security;
-- 読み取り：全員
drop policy if exists read_all on public.derby_games;
create policy read_all on public.derby_games for select using (true);
drop policy if exists read_all on public.derby_races;
create policy read_all on public.derby_races for select using (true);
drop policy if exists read_all on public.derby_participants;
create policy read_all on public.derby_participants for select using (true);
drop policy if exists read_all on public.derby_bets;
create policy read_all on public.derby_bets for select using (true);
-- 参加者（anon）：参加登録と投票のみ。投票は受付中（idle）の現在レースだけ
drop policy if exists guest_join on public.derby_participants;
create policy guest_join on public.derby_participants for insert to anon
with check (score = 0);
drop policy if exists guest_bet on public.derby_bets;
create policy guest_bet on public.derby_bets for insert to anon
with check (
score_gained = 0
and exists (
select 1 from public.derby_games g
where g.id = game_id and g.status = 'idle' and g.current_race_index =
race_index
)
)
-- 幹事（authenticated）：すべて操作可
drop policy if exists host_all on public.derby_games;
create policy host_all on public.derby_games for all to authenticated using
(true) with check (true);
drop policy if exists host_all on public.derby_races;
create policy host_all on public.derby_races for all to authenticated using
(true) with check (true);
drop policy if exists host_all on public.derby_participants;
create policy host_all on public.derby_participants for all to authenticated
using (true) with check (true);
drop policy if exists host_all on public.derby_bets;
create policy host_all on public.derby_bets for all to authenticated using
(true) with check (true);
