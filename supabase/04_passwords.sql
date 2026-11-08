-- Администратор и смена паролей.
-- Как применить: SQL Editor → New query → вставить файл → Run. Повторный запуск безопасен.
--
-- Свой пароль каждый меняет в приложении сам: для этого ничего в базе не нужно.
-- Этот файл добавляет администратора, который может задать новый пароль любому
-- из бригады, например если человек свой забыл.

-- Отметка администратора. Поставить её можно только в панели Supabase
-- (Table Editor → profiles → is_admin): из приложения её не изменить.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Новый пароль для пользователя. Работает, только если её вызывает администратор.
-- Все входы этого пользователя на других устройствах сбрасываются: там нужно будет
-- войти с новым паролем. Неотправленные изменения на тех устройствах не теряются.
create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin) then
    raise exception 'only admin can set passwords' using errcode = '42501';
  end if;
  if length(coalesce(new_password, '')) < 8 then
    raise exception 'password too short' using errcode = '22023';
  end if;

  -- Пароль хранится так же, как его хранит сам Supabase: в виде хэша bcrypt.
  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end;
$$;

revoke execute on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
