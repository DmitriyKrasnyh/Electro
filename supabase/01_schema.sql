-- Структура базы для приложения «Электромонтаж».
-- Как применить: панель Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Повторный запуск безопасен: уже созданное не пересоздаётся и данные не теряются.

-- ID записей. Их создаёт приложение на телефоне (15 символов a-z0-9), чтобы запись
-- сразу получила постоянный ID даже без связи. Эта функция нужна для записей,
-- созданных в самой панели Supabase.
create or replace function public.new_id() returns text
language sql volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', (floor(random() * 36))::int + 1, 1), '')
  from generate_series(1, 15)
$$;

-- Время создания и изменения ставит сервер, а не телефон: по полю updated
-- приложение забирает только то, что изменилось с прошлого раза.
create or replace function public.set_timestamps() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created := now();
  else
    new.created := old.created;
  end if;
  new.updated := now();
  return new;
end;
$$;

-- --- Профили: имя и логин монтажника. Учётные записи живут в auth.users ---
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- Профиль появляется сам, когда администратор добавляет пользователя.
-- Логин берётся из адреса: ivanov@brigada.local → ivanov. Имя потом можно поменять.
create or replace function public.create_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, name)
  values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Функцию вызывает только триггер ниже, напрямую из приложения она недоступна.
revoke execute on function public.create_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile();

-- Пользователи, добавленные до этого файла, тоже получают профиль.
insert into public.profiles (id, username, name)
select id, split_part(email, '@', 1), split_part(email, '@', 1)
from auth.users
where email is not null
on conflict (id) do nothing;

-- --- Объекты ---
create table if not exists public.objects (
  id text primary key default public.new_id(),
  name text not null check (name <> ''),
  address text,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- --- Этажи ---
create table if not exists public.floors (
  id text primary key default public.new_id(),
  -- Без каскада: объект с этажами удалить нельзя.
  object text not null references public.objects (id),
  name text not null check (name <> ''),
  "order" integer not null default 0,
  plan text, -- путь к файлу плана в хранилище plans
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- --- Помещения: удаляются вместе с этажом ---
create table if not exists public.rooms (
  id text primary key default public.new_id(),
  floor text not null references public.floors (id) on delete cascade,
  name text not null check (name <> ''),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- --- Задачи ---
create table if not exists public.tasks (
  id text primary key default public.new_id(),
  -- Без каскада: этаж с задачами удалить нельзя, задачи случайно не пропадут.
  floor text not null references public.floors (id),
  room text references public.rooms (id) on delete set null,
  system text not null check (system in ('skud', 'video', 'emergency_light', 'scs', 'electric', 'panels')),
  title text not null check (title <> ''),
  description text,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'mounted', 'checked', 'done')),
  blocked boolean not null default false,
  blocked_reason text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  assignee uuid references public.profiles (id) on delete set null,
  marking text,
  -- Точка на плане в процентах от листа. Пара 0 и 0 значит «точка не поставлена».
  plan_x double precision not null default 0 check (plan_x between 0 and 100),
  plan_y double precision not null default 0 check (plan_y between 0 and 100),
  checklist jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  -- Время правки по часам телефона: правка из подвала может дойти через несколько часов.
  client_updated_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- --- Фото: удаляются вместе с задачей ---
create table if not exists public.photos (
  id text primary key default public.new_id(),
  task text not null references public.tasks (id) on delete cascade,
  file text not null, -- путь к файлу в хранилище photos
  type text not null check (type in ('before', 'after', 'hidden_works', 'marking', 'defect')),
  comment text,
  author uuid not null references public.profiles (id),
  taken_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- --- История задачи: удаляется вместе с задачей ---
create table if not exists public.task_history (
  id text primary key default public.new_id(),
  task text not null references public.tasks (id) on delete cascade,
  "user" uuid not null references public.profiles (id),
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null, -- время правки по часам телефона
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- Индексы: приложение ищет по времени изменения и по задаче.
create index if not exists profiles_updated on public.profiles (updated);
create index if not exists objects_updated on public.objects (updated);
create index if not exists floors_updated on public.floors (updated);
create index if not exists rooms_updated on public.rooms (updated);
create index if not exists tasks_updated on public.tasks (updated);
create index if not exists photos_updated on public.photos (updated);
create index if not exists task_history_updated on public.task_history (updated);
create index if not exists task_history_task on public.task_history (task, changed_at);

-- Триггеры времени на все таблицы.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'objects', 'floors', 'rooms', 'tasks', 'photos', 'task_history'] loop
    execute format('drop trigger if exists set_timestamps on public.%I', t);
    execute format('create trigger set_timestamps before insert or update on public.%I
                    for each row execute function public.set_timestamps()', t);
  end loop;
end;
$$;

-- --- Права доступа (RLS) ---
-- Гость не видит ничего. Вошедший монтажник читает всё, создаёт и меняет рабочие записи.
-- Удалять из приложения нельзя ничего: удаляет только администратор в панели Supabase.
-- Историю можно только дополнять, иначе ей нельзя доверять.
alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.floors enable row level security;
alter table public.rooms enable row level security;
alter table public.tasks enable row level security;
alter table public.photos enable row level security;
alter table public.task_history enable row level security;

do $$
declare
  t text;
begin
  -- Чтение: все таблицы.
  foreach t in array array['profiles', 'objects', 'floors', 'rooms', 'tasks', 'photos', 'task_history'] loop
    execute format('drop policy if exists "read for crew" on public.%I', t);
    execute format('create policy "read for crew" on public.%I for select to authenticated using (true)', t);
  end loop;
  -- Создание: всё, кроме профилей и объектов (их заводит администратор).
  foreach t in array array['floors', 'rooms', 'tasks', 'photos', 'task_history'] loop
    execute format('drop policy if exists "create for crew" on public.%I', t);
    execute format('create policy "create for crew" on public.%I for insert to authenticated with check (true)', t);
  end loop;
  -- Изменение: этажи, помещения и задачи. Фото и история не меняются.
  foreach t in array array['floors', 'rooms', 'tasks'] loop
    execute format('drop policy if exists "update for crew" on public.%I', t);
    execute format('create policy "update for crew" on public.%I for update to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

-- Свой профиль (имя) можно поменять самому.
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Логин менять нельзя: по нему человек входит.
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- --- Отправка одного действия целиком ---
-- Одно действие человека (например, смена статуса и строка истории) сохраняется
-- одной транзакцией: либо всё, либо ничего. Права (RLS) действуют как при обычной записи.
-- requests: [{ "method": "create"|"update", "table": "...", "id": "...", "body": {...} }]
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
    if tbl not in ('floors', 'rooms', 'tasks', 'photos', 'task_history') then
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

-- --- Хранилище файлов ---
-- Оба хранилища закрытые: файлы открываются только у вошедших монтажников.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('plans', 'plans', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Загружать и смотреть можно, менять и удалять нельзя.
drop policy if exists "crew reads files" on storage.objects;
create policy "crew reads files" on storage.objects
  for select to authenticated using (bucket_id in ('photos', 'plans'));

drop policy if exists "crew uploads files" on storage.objects;
create policy "crew uploads files" on storage.objects
  for insert to authenticated with check (bucket_id in ('photos', 'plans'));
