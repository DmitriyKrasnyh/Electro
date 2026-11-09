-- Точки помещений на плане этажа: по ним на плане показываются номера помещений,
-- а из кабельного журнала можно открыть план сразу на нужном помещении.
-- Как применить: SQL Editor → New query → вставить файл → Run. Повторный запуск безопасен.
--
-- Координаты в процентах от листа плана, как у точек задач. Пара 0 и 0 значит
-- «точка не поставлена». Менять их могут все вошедшие: права на помещения уже есть
-- в 01_schema.sql.

alter table public.rooms
  add column if not exists plan_x double precision not null default 0 check (plan_x between 0 and 100);
alter table public.rooms
  add column if not exists plan_y double precision not null default 0 check (plan_y between 0 and 100);
