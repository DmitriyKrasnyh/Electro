import { ServerError } from "./supabase"
import type { Task, TaskPriority, TaskStatus } from "../types"

// Вспомогательные функции для показа данных на экране.

// Срок хранится как календарная дата, поэтому берём только её, без пересчёта
// в часовой пояс. Иначе на другом устройстве дата могла бы сдвинуться на день.
export function formatDate(value: string): string {
  if (!value) return ""
  const [year, month, day] = value.slice(0, 10).split("-")
  return `${day}.${month}.${year}`
}

// Дата из поля <input type="date"> ("2026-11-10"). В базе срок хранится как дата
// без времени, в том же виде.
export function dateToDb(date: string): string {
  return date
}

// Точное время события: показываем его в часовом поясе устройства.
export function formatDateTime(value: string): string {
  if (!value) return ""
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done") return false
  // Локаль en-CA даёт дату в виде 2026-11-05: такие строки можно сравнивать напрямую.
  const today = new Date().toLocaleDateString("en-CA")
  return task.due_date.slice(0, 10) < today
}

// Пара нулей значит, что точки на плане нет: так поле заполнено по умолчанию.
// Подходит и для задач, и для помещений. У помещений, загруженных до появления точек, полей нет вовсе.
export function hasPlanPoint(item: { plan_x?: number; plan_y?: number }): boolean {
  return (item.plan_x ?? 0) > 0 || (item.plan_y ?? 0) > 0
}

// Короткая подпись помещения на плане: номер из начала названия («21 Кабинет врача 4» → «21»).
// Если номера нет, само название.
export function roomLabel(name: string): string {
  return name.match(/^\d+/)?.[0] ?? name
}

export function nameById(list: { id: string; name: string }[], id: string): string {
  return list.find((item) => item.id === id)?.name ?? ""
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

// Порядок в списках: сданные в конце, выше приоритет раньше, затем свежие правки.
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.updated.localeCompare(a.updated),
  )
}

// Такой записи нет в локальной базе.
export class NotFoundError extends Error {}

// Текст ошибки для человека. Ответы сервера на английском, их не показываем.
export function errorMessage(error: unknown): string {
  if (error instanceof NotFoundError) return "Запись не найдена. Возможно, её уже удалили."
  if (error instanceof ServerError && error.status === 0) {
    return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
  }
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return "На устройстве закончилось место. Освободите память и попробуйте ещё раз."
  }
  return "Что-то пошло не так. Попробуйте ещё раз."
}

// Склонение: 1 изменение, 2 изменения, 5 изменений.
export function changesWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return "изменений"
  if (last === 1) return "изменение"
  if (last >= 2 && last <= 4) return "изменения"
  return "изменений"
}

// «1 изменение ждёт отправки», «3 изменения ждут отправки».
export function waitingText(count: number): string {
  const verb = changesWord(count) === "изменение" ? "ждёт" : "ждут"
  return `${count} ${changesWord(count)} ${verb} отправки`
}

// Цвета статусов. Классы записаны целиком, иначе Tailwind их не найдёт.
export const STATUS_STYLES: Record<TaskStatus, { badge: string; bar: string }> = {
  not_started: { badge: "bg-gray-300 text-gray-950", bar: "bg-gray-400" },
  in_progress: { badge: "bg-blue-700 text-white", bar: "bg-blue-700" },
  mounted: { badge: "bg-yellow-300 text-gray-950", bar: "bg-yellow-400" },
  checked: { badge: "bg-purple-700 text-white", bar: "bg-purple-700" },
  done: { badge: "bg-green-700 text-white", bar: "bg-green-700" },
}
