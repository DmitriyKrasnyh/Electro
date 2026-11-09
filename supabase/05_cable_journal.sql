-- Кабельный журнал: линии по проекту и отметки о ходе работ.
-- Как применить: SQL Editor → New query → вставить файл → Run. Повторный запуск безопасен.
--
-- Линии загружает администратор (SQL-файлом с данными объекта). Монтажники в приложении
-- только ставят и снимают отметки: проложен, промаркирован, оконечен, проверен.
-- Проектные поля (маркировка, трасса, марка, длина) из приложения не меняются.

create table if not exists public.cable_lines (
  id text primary key default public.new_id(),
  object text not null references public.objects (id) on delete cascade,
  system text not null check (system in ('skud', 'video', 'emergency_light', 'scs', 'electric', 'panels')),
  marking text not null check (marking <> ''),
  from_point text not null, -- начало трассы, например «SW1» или «серверная»
  to_point text not null, -- конец трассы, например «AS1.1» или «Кабинет врача 4»
  floor text references public.floors (id) on delete set null,
  room text references public.rooms (id) on delete set null,
  cable_brand text not null, -- марка по проекту
  cores text not null, -- число и сечение жил, например «4х2х0,52»
  design_length numeric not null default 0, -- длина по проекту, м
  laid_brand text, -- марка фактически проложенного кабеля, пусто = как по проекту
  sort integer not null default 0, -- порядок строк, как в журнале
  -- Отметки о ходе работ: время по часам телефона и кто отметил. Пусто = ещё не сделано.
  laid_at timestamptz,
  laid_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  marked_by uuid references public.profiles (id) on delete set null,
  terminated_at timestamptz,
  terminated_by uuid references public.profiles (id) on delete set null,
  tested_at timestamptz,
  tested_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (object, marking)
);

create index if not exists cable_lines_updated on public.cable_lines (updated);

drop trigger if exists set_timestamps on public.cable_lines;
create trigger set_timestamps before insert or update on public.cable_lines
  for each row execute function public.set_timestamps();

-- Права: читают все вошедшие, менять можно только отметки и марку проложенного кабеля.
alter table public.cable_lines enable row level security;

drop policy if exists "read for crew" on public.cable_lines;
create policy "read for crew" on public.cable_lines for select to authenticated using (true);

drop policy if exists "update for crew" on public.cable_lines;
create policy "update for crew" on public.cable_lines for update to authenticated using (true) with check (true);

revoke insert, update, delete on public.cable_lines from anon, authenticated;
grant update (laid_brand, laid_at, laid_by, marked_at, marked_by, terminated_at, terminated_by, tested_at, tested_by)
  on public.cable_lines to authenticated;

-- Приложение отправляет отметки той же функцией, что и остальные правки (см. 01_schema.sql):
-- добавляем таблицу в список разрешённых. Права на колонки всё равно проверяет база.
create or replace function public.apply_changes(requests jsonb) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request jsonb;
  tbl text;
  body jsonb;
  columns text;
  assignments text;
  affected integer;
begin
  for request in select * from jsonb_array_elements(requests) loop
    tbl := request ->> 'table';
    if tbl not in ('floors', 'rooms', 'tasks', 'photos', 'task_history', 'cable_lines') then
      raise exception 'table % is not allowed', tbl using errcode = '42501';
    end if;
    -- Служебные поля ставит сервер.
    body := (request -> 'body') - 'id' - 'created' - 'updated';

    if request ->> 'method' = 'create' then
      body := body || jsonb_build_object('id', request ->> 'id');
      select string_agg(format('%I', key), ', ') into columns from jsonb_object_keys(body) as key;
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
        tbl, columns, columns, tbl
      ) using body;
    elsif request ->> 'method' = 'update' then
      select string_agg(format('%I = r.%I', key, key), ', ') into assignments from jsonb_object_keys(body) as key;
      if assignments is null then
        continue;
      end if;
      execute format(
        'update public.%I as t set %s from jsonb_populate_record(null::public.%I, $1) as r where t.id = $2',
        tbl, assignments, tbl
      ) using body, request ->> 'id';
      get diagnostics affected = row_count;
      if affected = 0 then
        -- Код P0002 приложение понимает как «запись уже удалена».
        raise exception 'record %/% not found', tbl, request ->> 'id' using errcode = 'P0002';
      end if;
    else
      raise exception 'unknown method %', request ->> 'method' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke execute on function public.apply_changes(jsonb) from public, anon;
grant execute on function public.apply_changes(jsonb) to authenticated;
