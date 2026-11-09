import { createClient } from "@supabase/supabase-js"

// Единственное подключение к Supabase на всё приложение.
// Публичный ключ можно держать в приложении: доступ к данным ограничивают права в базе
// (см. supabase/01_schema.sql), а без входа там не видно ничего.

const UPLOAD_TIMEOUT = 10 * 60_000 // файл плана бывает до 50 МБ, а связь на объекте плохая
const REQUEST_TIMEOUT = 30_000

// Свой срок ожидания для запросов, которым библиотека не даёт его задать (вход, загрузка
// файлов). Без него запрос на пропавшей связи висел бы бесконечно.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init)
  const isUpload = String(input instanceof Request ? input.url : input).includes("/storage/v1/object/") && init?.method === "POST"
  return fetch(input, { ...init, signal: AbortSignal.timeout(isUpload ? UPLOAD_TIMEOUT : REQUEST_TIMEOUT) })
}

// Ключ, под которым библиотека хранит вход в браузере. Задан явно: его читает lib/auth.ts.
export const AUTH_STORAGE_KEY = "electro-auth"

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true, // вход сохраняется после перезагрузки
    autoRefreshToken: true,
    detectSessionInUrl: false, // входа по ссылке из письма у нас нет
  },
  global: { fetch: fetchWithTimeout },
})

// --- Ошибки ---

// Ошибка от сервера в одном виде для базы, файлов и входа.
// status 0 значит, что ответа не было: нет связи или вышло время ожидания.
export class ServerError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = "ServerError"
    this.status = status
    this.code = code
  }
}

interface AnyError {
  message?: string
  status?: number
  code?: string
  name?: string
}

// Ответ библиотеки → данные или исключение ServerError.
export function unwrap<T>(result: { data: T; error: unknown; status?: number }): NonNullable<T> {
  if (result.error) throw toServerError(result.error, result.status)
  return result.data as NonNullable<T>
}

export function toServerError(error: unknown, status?: number): ServerError {
  if (error instanceof ServerError) return error
  const e = (error ?? {}) as AnyError
  // Обрыв связи библиотека сообщает по-разному: статус 0, «повторяемая» ошибка входа,
  // неизвестная ошибка хранилища или истёкшее время ожидания.
  const noAnswer =
    status === 0 ||
    e.name === "AuthRetryableFetchError" ||
    e.name === "StorageUnknownError" ||
    e.name === "TimeoutError" ||
    e.name === "AbortError"
  const finalStatus = noAnswer ? 0 : (status ?? e.status ?? 0)
  return new ServerError(e.message ?? String(error), finalStatus, e.code ?? "")
}

// Связи нет или сервер временно не справляется: стоит повторить позже.
export function isConnectionProblem(error: unknown): boolean {
  const { status } = toServerError(error)
  return status === 0 || status === 408 || status === 429 || status >= 500
}

// --- Записи: формат сервера ↔ формат на устройстве ---

// На устройстве пустые поля хранятся пустой строкой: так с ними проще работать экранам.
// В базе это null. Чек-лист остаётся null: у него «пусто» значит «чек-листа нет».
const KEEP_NULL = new Set(["checklist"])

// Время сервер отдаёт как 2026-11-08T10:00:00.123456+00:00, а устройство пишет
// 2026-11-08T10:00:00.123Z. Приводим к одному виду, иначе сравнение строк врёт.
const TIME_FIELDS = new Set([
  "created",
  "updated",
  "changed_at",
  "client_updated_at",
  "taken_at",
  "laid_at",
  "marked_at",
  "terminated_at",
  "tested_at",
])

export function fromServer(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === null) result[key] = KEEP_NULL.has(key) ? null : ""
    else if (TIME_FIELDS.has(key) && typeof value === "string") result[key] = new Date(value).toISOString()
    else result[key] = value
  }
  return result
}

export function toServer(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === "" ? null : value]))
}

// Таблица на устройстве → таблица в Supabase. Профили на устройстве лежат в users.
export const SERVER_TABLES: Record<string, string> = {
  users: "profiles",
  objects: "objects",
  floors: "floors",
  rooms: "rooms",
  tasks: "tasks",
  task_history: "task_history",
  photos: "photos",
  cable_lines: "cable_lines",
}
