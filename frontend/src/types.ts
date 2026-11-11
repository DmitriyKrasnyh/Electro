// Типы данных и русские названия. Должны совпадать с таблицами
// в supabase/01_schema.sql

// Поля, которые есть у каждой записи.
export interface BaseRecord {
  id: string
  created: string
  updated: string
}

export interface User extends BaseRecord {
  username: string
  name: string
  is_admin?: boolean // может задавать пароли другим (см. supabase/04_passwords.sql)
}

export interface ProjectObject extends BaseRecord {
  name: string
  address: string
}

export interface Floor extends BaseRecord {
  object: string
  name: string
  order: number
  plan: string
}

export interface Room extends BaseRecord {
  floor: string
  name: string
  // Точка помещения на плане этажа в процентах, как у задач. Пара нулей: точки нет.
  plan_x: number
  plan_y: number
}

export type TaskSystem = "skud" | "video" | "emergency_light" | "scs" | "electric" | "panels" | "grounding"
export type TaskStatus = "not_started" | "in_progress" | "mounted" | "checked" | "done"
export type TaskPriority = "low" | "normal" | "high"
export type PhotoType = "before" | "after" | "hidden_works" | "marking" | "defect"

export interface ChecklistItem {
  text: string
  done: boolean
}

// Пустые необязательные поля на устройстве хранятся так (см. lib/supabase.ts):
// текст, связь и дата это "", число это 0, JSON это null.
export interface Task extends BaseRecord {
  floor: string
  room: string
  system: TaskSystem
  title: string
  description: string
  status: TaskStatus
  blocked: boolean
  blocked_reason: string
  priority: TaskPriority
  due_date: string
  assignee: string
  marking: string
  // Пустое значение тоже 0, поэтому пара 0 и 0 означает «точка не поставлена».
  plan_x: number
  plan_y: number
  checklist: ChecklistItem[] | null
  created_by: string
  updated_by: string
  client_updated_at: string
  // Цепочка: задача, которую нужно сдать раньше этой. Пусто, если задача ни от чего не зависит.
  depends_on: string
}

export interface Photo extends BaseRecord {
  task: string
  file: string
  type: PhotoType
  comment: string
  author: string
  taken_at: string
}

export interface TaskHistory extends BaseRecord {
  task: string
  user: string
  field: string
  old_value: string
  new_value: string
  changed_at: string // время правки по часам устройства, может быть раньше created
}

// Линия кабельного журнала. Проектные поля загружает администратор, монтажники ставят
// отметки о ходе работ. Пустое время отметки значит, что этап ещё не сделан.
export interface CableLine extends BaseRecord {
  object: string
  system: TaskSystem
  marking: string
  from_point: string
  to_point: string
  floor: string
  room: string
  cable_brand: string
  cores: string
  design_length: number
  laid_brand: string // пусто = проложен кабель по проекту
  sort: number
  laid_at: string // «Проведён»
  laid_by: string
  box_at: string // «Выведен в подрозетник»
  box_by: string
  marked_at: string
  marked_by: string
  terminated_at: string
  terminated_by: string
  tested_at: string
  tested_by: string
}

export type CableStage = "laid" | "box" | "marked" | "terminated" | "tested"

// Замер сопротивления заземления.
export interface GroundMeasurement extends BaseRecord {
  object: string
  floor: string
  room: string
  place: string // что мерили, например «Корпус ШТК»
  resistance: number // Ом
  norm: number // допустимое значение, Ом
  instrument: string
  comment: string
  measured_at: string
  measured_by: string
}

// PDF-документ объекта: проект, альбомы, схемы.
export interface ProjectDocument extends BaseRecord {
  object: string
  title: string
  file: string // путь в хранилище documents
  size: number // байты
  created_by: string
}

// Списки значений в порядке показа на экране.
export const TASK_SYSTEMS: TaskSystem[] = ["skud", "video", "emergency_light", "scs", "electric", "panels", "grounding"]
export const TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "mounted", "checked", "done"]
export const TASK_PRIORITIES: TaskPriority[] = ["high", "normal", "low"]
export const PHOTO_TYPES: PhotoType[] = ["before", "after", "hidden_works", "marking", "defect"]
export const CABLE_STAGES: CableStage[] = ["laid", "box", "marked", "terminated", "tested"]

export function isTaskSystem(value: string | undefined): value is TaskSystem {
  return TASK_SYSTEMS.includes(value as TaskSystem)
}

// Названия полей для экрана истории.
export const HISTORY_FIELD_LABELS: Record<string, string> = {
  floor: "Этаж",
  room: "Помещение",
  system: "Система",
  title: "Название",
  description: "Описание",
  status: "Статус",
  blocked: "Блокировка",
  blocked_reason: "Причина блокировки",
  priority: "Приоритет",
  due_date: "Срок",
  assignee: "Исполнитель",
  marking: "Маркировка",
  checklist: "Чек-лист",
  plan_point: "Точка на плане",
  depends_on: "Сначала нужно сделать",
}

export const SYSTEM_LABELS: Record<TaskSystem, string> = {
  skud: "СКУД",
  video: "Видеонаблюдение",
  emergency_light: "Аварийное освещение",
  scs: "СКС (интернет)",
  electric: "Электрика",
  panels: "Щиты",
  grounding: "Заземление",
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  mounted: "Смонтировано",
  checked: "Проверено",
  done: "Сдано",
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
}

export const CABLE_STAGE_LABELS: Record<CableStage, string> = {
  laid: "Проведён",
  box: "Выведен в подрозетник",
  marked: "Промаркирован",
  terminated: "Оконечен",
  tested: "Проверен",
}

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  before: "До",
  after: "После",
  hidden_works: "Скрытые работы",
  marking: "Маркировка",
  defect: "Дефект",
}
