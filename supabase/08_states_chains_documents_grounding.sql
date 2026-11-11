-- Состояние «выведен в подрозетник», цепочки задач, документы объекта, заземление.
-- Как применить: SQL Editor → New query → вставить весь файл → Run. Повторный запуск безопасен.

-- --- Администратор: проверка для правил доступа ---
-- security definer: функция читает профиль, даже если правила таблицы этого не позволяют.
create or replace function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- --- 1. Кабельный журнал: «выведен в подрозетник» ---
-- «Проведён» хранится в прежних полях laid_at/laid_by (раньше отметка называлась «Проложен»).
alter table public.cable_lines add column if not exists box_at timestamptz;
alter table public.cable_lines add column if not exists box_by uuid references public.profiles (id) on delete set null;
grant update (box_at, box_by) on public.cable_lines to authenticated;

-- --- 2. Цепочки: задача ждёт другую ---
alter table public.tasks add column if not exists depends_on text references public.tasks (id) on delete set null;
alter table public.tasks drop constraint if exists tasks_depends_on_not_self;
alter table public.tasks add constraint tasks_depends_on_not_self check (depends_on is null or depends_on <> id);

-- --- 3. Система «Заземление» ---
alter table public.tasks drop constraint if exists tasks_system_check;
alter table public.tasks add constraint tasks_system_check
  check (system in ('skud', 'video', 'emergency_light', 'scs', 'electric', 'panels', 'grounding'));
alter table public.cable_lines drop constraint if exists cable_lines_system_check;
alter table public.cable_lines add constraint cable_lines_system_check
  check (system in ('skud', 'video', 'emergency_light', 'scs', 'electric', 'panels', 'grounding'));

-- --- 4. Замеры сопротивления заземления ---
create table if not exists public.ground_measurements (
  id text primary key default public.new_id(),
  object text not null references public.objects (id) on delete cascade,
  floor text references public.floors (id) on delete set null,
  room text references public.rooms (id) on delete set null,
  place text not null check (place <> ''), -- что мерили, например «Корпус ШТК»
  resistance numeric not null check (resistance >= 0), -- Ом
  norm numeric not null default 4 check (norm > 0), -- допустимое, Ом (по проекту не более 4)
  instrument text, -- прибор
  comment text,
  measured_at timestamptz not null, -- время замера по часам телефона
  measured_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists ground_measurements_updated on public.ground_measurements (updated);
drop trigger if exists set_timestamps on public.ground_measurements;
create trigger set_timestamps before insert or update on public.ground_measurements
  for each row execute function public.set_timestamps();

-- --- 5. Документы объекта (PDF) ---
create table if not exists public.documents (
  id text primary key default public.new_id(),
  object text not null references public.objects (id) on delete cascade,
  title text not null check (title <> ''),
  file text not null, -- путь в хранилище documents
  size bigint not null default 0, -- байты
  created_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists documents_updated on public.documents (updated);
drop trigger if exists set_timestamps on public.documents;
create trigger set_timestamps before insert or update on public.documents
  for each row execute function public.set_timestamps();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- --- Права ---
alter table public.ground_measurements enable row level security;
alter table public.documents enable row level security;

-- Замеры: читают и записывают все, исправляют все (ошибку ввода), удаляет администратор.
drop policy if exists "read for crew" on public.ground_measurements;
create policy "read for crew" on public.ground_measurements for select to authenticated using (true);
drop policy if exists "create for crew" on public.ground_measurements;
create policy "create for crew" on public.ground_measurements for insert to authenticated with check (true);
drop policy if exists "update for crew" on public.ground_measurements;
create policy "update for crew" on public.ground_measurements for update to authenticated using (true) with check (true);
drop policy if exists "delete for admin" on public.ground_measurements;
create policy "delete for admin" on public.ground_measurements for delete to authenticated using ((select public.is_admin()));

-- Документы: читают все, добавляют и удаляют только администраторы.
drop policy if exists "read for crew" on public.documents;
create policy "read for crew" on public.documents for select to authenticated using (true);
drop policy if exists "create for admin" on public.documents;
create policy "create for admin" on public.documents for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "update for admin" on public.documents;
create policy "update for admin" on public.documents for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "delete for admin" on public.documents;
create policy "delete for admin" on public.documents for delete to authenticated using ((select public.is_admin()));

-- Задачи: удалить может только администратор (в приложении такой кнопки нет,
-- но так он может убрать ошибочные задачи, не заходя в панель Supabase).
drop policy if exists "delete for admin" on public.tasks;
create policy "delete for admin" on public.tasks for delete to authenticated using ((select public.is_admin()));

-- Файлы документов: смотрят все вошедшие, загружают и удаляют администраторы.
drop policy if exists "crew reads documents" on storage.objects;
create policy "crew reads documents" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
drop policy if exists "admin uploads documents" on storage.objects;
create policy "admin uploads documents" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and (select public.is_admin()));
drop policy if exists "admin deletes documents" on storage.objects;
create policy "admin deletes documents" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and (select public.is_admin()));

-- --- Отправка действий: новые таблицы и удаление ---
-- Удаление проходит, только если его разрешают правила таблицы (см. выше). Удалить уже
-- удалённое не ошибка: повторная отправка после обрыва связи должна проходить спокойно.
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
    if tbl not in ('floors', 'rooms', 'tasks', 'photos', 'task_history', 'cable_lines', 'ground_measurements', 'documents') then
      raise exception 'table % is not allowed', tbl using errcode = '42501';
    end if;
    -- Служебные поля ставит сервер.
    body := coalesce(request -> 'body', '{}'::jsonb) - 'id' - 'created' - 'updated';

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
    elsif request ->> 'method' = 'delete' then
      execute format('delete from public.%I where id = $1', tbl) using request ->> 'id';
      get diagnostics affected = row_count;
      -- Запись есть, но не удалилась: правила не разрешают удалять.
      if affected = 0 then
        execute format('select 1 from public.%I where id = $1', tbl) using request ->> 'id';
        get diagnostics affected = row_count;
        if affected > 0 then
          raise exception 'delete from % is not allowed', tbl using errcode = '42501';
        end if;
      end if;
    else
      raise exception 'unknown method %', request ->> 'method' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke execute on function public.apply_changes(jsonb) from public, anon;
grant execute on function public.apply_changes(jsonb) to authenticated;
