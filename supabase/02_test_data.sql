-- Тестовые данные: объект, 3 этажа, 9 помещений, 15 задач.
-- Для настоящего объекта этот файл не нужен.
-- Как применить: SQL Editor → New query → вставить файл → Run.
-- Повторный запуск ничего не задвоит: если объект уже есть, файл ничего не делает.
-- Исполнители берутся по логинам ivanov, petrov, sidorov. Если таких пользователей
-- ещё нет, задачи создадутся без исполнителя.

do $$
declare
  object_id text;
  floor_ids jsonb := '{}';
  room_ids jsonb := '{}';
  f record;
  r text;
  t jsonb;
  author uuid := (select id from public.profiles where username = 'ivanov');
begin
  -- Имена на экранах. Меняем только те, что ещё совпадают с логином.
  update public.profiles set name = 'Иванов' where username = 'ivanov' and name = username;
  update public.profiles set name = 'Петров' where username = 'petrov' and name = username;
  update public.profiles set name = 'Сидоров' where username = 'sidorov' and name = username;

  if exists (select 1 from public.objects) then
    raise notice 'В базе уже есть объект, ничего не добавлено.';
    return;
  end if;

  insert into public.objects (name, address) values ('Тестовый объект', 'ул. Примерная, 1')
  returning id into object_id;

  for f in
    select * from (values
      ('parking', 'Паркинг -1', 1, array['Электрощитовая', 'Венткамера', 'Парковка']),
      ('first', '1 этаж', 2, array['Холл', 'Серверная', 'Коридор']),
      ('second', '2 этаж', 3, array['201', '202', 'Коридор'])
    ) as v(key, name, sort, rooms)
  loop
    insert into public.floors (object, name, "order") values (object_id, f.name, f.sort)
    returning jsonb_build_object(f.key, id) || floor_ids into floor_ids;
    foreach r in array f.rooms loop
      insert into public.rooms (floor, name) values (floor_ids ->> f.key, r)
      returning jsonb_build_object(f.key || '/' || r, id) || room_ids into room_ids;
    end loop;
  end loop;

  for t in select * from jsonb_array_elements($json$[
    {"system": "skud", "floor": "first", "room": "Холл", "title": "Монтаж турникета на входе", "status": "in_progress", "priority": "high", "assignee": "ivanov", "marking": "ТР-1", "due": 5},
    {"system": "skud", "floor": "first", "room": "Коридор", "title": "Установить считыватель у двери серверной", "status": "not_started", "assignee": "petrov", "marking": "СЧ-3"},
    {"system": "skud", "floor": "second", "room": "201", "title": "Подключить электромагнитный замок", "status": "not_started", "blocked": true, "blocked_reason": "Дверь ещё не установлена", "marking": "ЗМ-7"},
    {"system": "video", "floor": "parking", "room": "Парковка", "title": "Установить камеры на въезде", "status": "mounted", "priority": "high", "assignee": "sidorov", "marking": "CAM-01, CAM-02", "due": 3},
    {"system": "video", "floor": "first", "room": "Холл", "title": "Настроить камеру над ресепшеном", "status": "checked", "assignee": "sidorov", "marking": "CAM-05"},
    {"system": "video", "floor": "second", "room": "Коридор", "title": "Проложить кабель до камеры", "status": "in_progress", "assignee": "ivanov", "marking": "К-22"},
    {"system": "emergency_light", "floor": "parking", "room": "Парковка", "title": "Смонтировать светильники на путях эвакуации", "status": "in_progress", "assignee": "petrov", "marking": "АО-1 гр.2"},
    {"system": "emergency_light", "floor": "second", "room": "Коридор", "title": "Установить указатели «Выход»", "status": "done", "assignee": "petrov", "marking": "АО-2 гр.1"},
    {"system": "scs", "floor": "first", "room": "Серверная", "title": "Собрать и промаркировать патч-панель", "status": "mounted", "priority": "high", "assignee": "ivanov", "marking": "ПП-1", "due": 7},
    {"system": "scs", "floor": "second", "room": "202", "title": "Установить и расключить розетки RJ-45", "status": "not_started", "priority": "low", "marking": "Р-202.1–Р-202.4"},
    {"system": "electric", "floor": "first", "room": "Коридор", "title": "Проложить кабель освещения", "status": "done", "assignee": "sidorov", "marking": "ЩР-1.1 гр.3"},
    {"system": "electric", "floor": "second", "room": "201", "title": "Установить розетки и выключатели", "status": "in_progress", "assignee": "petrov", "marking": "ЩР-2.3 гр.5"},
    {"system": "electric", "floor": "parking", "room": "Венткамера", "title": "Подключить вентилятор", "status": "not_started", "blocked": true, "blocked_reason": "Вентилятор не поставлен, ждём от смежников", "priority": "high", "marking": "ЩР-П.1 гр.8"},
    {"system": "panels", "floor": "parking", "room": "Электрощитовая", "title": "Собрать ВРУ", "status": "in_progress", "priority": "high", "assignee": "ivanov", "marking": "ВРУ-1", "due": 10,
     "checklist": [{"text": "Установить автоматы", "done": true}, {"text": "Подключить вводной кабель", "done": true}, {"text": "Промаркировать группы", "done": false}, {"text": "Прозвонить цепи", "done": false}]},
    {"system": "panels", "floor": "second", "title": "Смонтировать щит этажа", "status": "not_started", "blocked": true, "blocked_reason": "Нет корпуса щита", "assignee": "sidorov", "marking": "ЩР-2.3",
     "checklist": [{"text": "Закрепить корпус", "done": false}, {"text": "Завести кабели", "done": false}]}
  ]$json$::jsonb)
  loop
    insert into public.tasks (
      floor, room, system, title, status, blocked, blocked_reason, priority, due_date,
      assignee, marking, checklist, created_by, updated_by, client_updated_at
    ) values (
      floor_ids ->> (t ->> 'floor'),
      room_ids ->> ((t ->> 'floor') || '/' || (t ->> 'room')),
      t ->> 'system',
      t ->> 'title',
      t ->> 'status',
      coalesce((t ->> 'blocked')::boolean, false),
      t ->> 'blocked_reason',
      coalesce(t ->> 'priority', 'normal'),
      current_date + (t ->> 'due')::int,
      (select id from public.profiles where username = t ->> 'assignee'),
      t ->> 'marking',
      t -> 'checklist',
      author,
      author,
      now()
    );
  end loop;

  raise notice 'Готово: 1 объект, 3 этажа, 9 помещений, 15 задач.';
end;
$$;
