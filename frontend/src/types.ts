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
}

export type TaskSystem = "skud" | "video" | "emergency_light" | "scs" | "electric" | "panels"
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

// Списки значений в порядке показа на экране.
export const TASK_SYSTEMS: TaskSystem[] = ["skud", "video", "emergency_light", "scs", "electric", "panels"]
export const TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "mounted", "checked", "done"]
export const TASK_PRIORITIES: TaskPriority[] = ["high", "normal", "low"]
export const PHOTO_TYPES: PhotoType[] = ["before", "after", "hidden_works", "marking", "defect"]

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
}

export const SYSTEM_LABELS: Record<TaskSystem, string> = {
  skud: "СКУД",
  video: "Видеонаблюдение",
  emergency_light: "Аварийное освещение",
  scs: "СКС (интернет)",
  electric: "Электрика",
  panels: "Щиты",
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

export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  before: "До",
  after: "После",
  hidden_works: "Скрытые работы",
  marking: "Маркировка",
  defect: "Дефект",
}
