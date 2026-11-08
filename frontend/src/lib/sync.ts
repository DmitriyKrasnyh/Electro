import { useEffect, useState } from "react"
import { forgetSession, isLoggedIn } from "./auth"
import { db, PLAN_ON_DEVICE, SYNCED_COLLECTIONS, type OutboxItem, type OutboxRequest } from "./db"
import {
  SERVER_TABLES,
  ServerError,
  fromServer,
  isConnectionProblem,
  supabase,
  toServer,
  toServerError,
  unwrap,
} from "./supabase"

// Синхронизация: отправляет очередь на сервер, затем забирает с него новые данные.
// Запускается при старте, при появлении сети, после каждой правки и по таймеру.

const CHECK_INTERVAL_ONLINE = 60_000 // как часто забирать правки коллег
const CHECK_INTERVAL_OFFLINE = 15_000 // как часто проверять, не появилась ли связь
const RECONCILE_INTERVAL = 10 * 60_000 // как часто сверять, что удалено на сервере
const CURSOR_OVERLAP = 60_000
const PULL_TIMEOUT = 30_000
const PUSH_TIMEOUT = 120_000 // фото на плохой связи загружается долго
const PLAN_TIMEOUT = 10 * 60_000 // файл плана бывает до 50 МБ
const PAGE_SIZE = 1000 // больше Supabase за один запрос не отдаёт
// Ссылки на фото действуют сутки, как и раньше. Обновляем их заранее, за полсуток.
const PHOTO_URL_LIFETIME = 24 * 60 * 60
const PHOTO_URL_RENEW_BEFORE = 12 * 60 * 60_000

const timeout = (ms: number) => AbortSignal.timeout(ms)

// --- Состояние для экранов ---

export interface SyncState {
  online: boolean
  syncing: boolean
}

let state: SyncState = { online: true, syncing: false }
const listeners = new Set<(state: SyncState) => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener(state))
}

export function useSyncState(): SyncState {
  const [value, setValue] = useState(state)
  useEffect(() => {
    listeners.add(setValue)
    setValue(state)
    return () => {
      listeners.delete(setValue)
    }
  }, [])
  return value
}

// --- Запуск ---

let running = false
let runAgain = false
let timer: ReturnType<typeof setTimeout> | undefined
let nextReconcileAt = 0

export function startSync(): void {
  window.addEventListener("online", () => void requestSync())
  window.addEventListener("offline", () => setState({ online: false }))
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void requestSync()
  })
  void requestSync()
}

export async function requestSync(): Promise<void> {
  if (!isLoggedIn()) return
  // Правка во время синхронизации: дождёмся конца и пройдём ещё раз.
  if (running) {
    runAgain = true
    return
  }

  running = true
  clearTimeout(timer)
  setState({ syncing: true })
  try {
    if (navigator.onLine === false) throw new ServerError("Нет сети", 0, "")
    do {
      runAgain = false
      await withLock(syncOnce)
    } while (runAgain)
    // Без ожидания: большой файл плана не должен задерживать отправку правок.
    void downloadPlans()
  } catch (error) {
    if (error instanceof SessionRejectedError) {
      // Данные не стираем: после нового входа очередь отправится.
      await forgetSession()
    } else {
      if (!isConnectionProblem(error)) console.error("Ошибка синхронизации", error)
      setState({ online: false })
    }
  } finally {
    running = false
    setState({ syncing: false })
    timer = setTimeout(() => void requestSync(), state.online ? CHECK_INTERVAL_ONLINE : CHECK_INTERVAL_OFFLINE)
  }
}

// Для выхода: ответ сервера, пришедший уже после него, снова записал бы вход
// и вернул стёртые данные на устройство.
export async function waitForSyncToFinish(): Promise<void> {
  while (running) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

// В двух вкладках синхронизация идёт по очереди. По адресу без HTTPS блокировок нет.
function withLock(task: () => Promise<void>): Promise<void> {
  return navigator.locks ? navigator.locks.request("electro-sync", task) : task()
}

// Сервер отказал именно в проверке входа: пароль сменили или пользователя удалили.
// Отказ на другом запросе не повод выкидывать человека.
class SessionRejectedError extends Error {}

async function syncOnce(): Promise<void> {
  await checkSession()
  setState({ online: true }) // сервер ответил, можно снять надпись «Нет связи»
  await pushOutbox()
  await pullEverything()
}

// Сначала проверяем вход. С недействительным входом сервер не выдаёт ошибку, а отдаёт
// пустые списки, как гостю, и локальные данные можно было бы принять за удалённые.
async function checkSession(): Promise<void> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (isConnectionProblem(error)) throw toServerError(error)
    throw new SessionRejectedError(error.message)
  }
  if (!data.user) throw new SessionRejectedError("Нет входа")
}

// --- Отправка очереди ---

async function pushOutbox(): Promise<void> {
  const items = await db.outbox.toArray()
  for (const item of items) {
    if (item.failed) continue
    try {
      await pushItem(item)
      await db.outbox.delete(item.id!)
    } catch (error) {
      if (alreadyOnServer(error)) {
        await db.outbox.delete(item.id!)
      } else if (isConnectionProblem(error) || toServerError(error).status === 401) {
        // Нет связи или вход как раз продлевается: остальное отправим при следующей синхронизации.
        throw error
      } else {
        // Сервер отказал по существу. Откладываем элемент, чтобы он не держал всю очередь.
        await db.outbox.update(item.id!, { failed: true, error: failureText(error) })
      }
    }
  }
}

async function pushItem(item: OutboxItem): Promise<void> {
  const requests = item.taskEditTime ? await dropOutdatedFields(item) : item.requests
  const changes = []
  for (const request of requests) {
    const body = { ...request.body }
    // Файл сначала кладём в хранилище, затем запись ссылается на него.
    // Файлы лежат в своих таблицах на устройстве, чтобы не хранить их дважды.
    if (request.collection === "photos" && request.filePath) {
      const photo = await db.photos.get(request.id)
      if (photo?.localFile) await uploadFile("photos", request.filePath, photo.localFile)
      body.file = request.filePath
    }
    if (isPlanUpload(request) && request.filePath) {
      const plan = await db.plans.get(request.id)
      if (plan) await uploadFile("plans", request.filePath, plan.file)
      body.plan = request.filePath
    }
    changes.push({ method: request.method, table: SERVER_TABLES[request.collection], id: request.id, body: toServer(body) })
  }

  // Все запросы одного действия сервер выполняет одной транзакцией.
  const timeLimit = requests.some(isPlanUpload) ? PLAN_TIMEOUT : PUSH_TIMEOUT
  unwrap(await supabase.rpc("apply_changes", { requests: changes }).abortSignal(timeout(timeLimit)))

  // Запоминаем путь файла на сервере, чтобы не скачивать обратно то, что уже лежит на устройстве.
  for (const request of requests) {
    if (isPlanUpload(request) && request.filePath) await db.plans.update(request.id, { fileName: request.filePath })
  }
}

// Файл с таким путём уже есть: прошлая попытка его загрузила, а ответ потерялся.
// Путь у каждого файла свой, поэтому там лежит тот же самый файл.
async function uploadFile(bucket: string, path: string, file: Blob): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (!error) return
  const details = error as { statusCode?: string; code?: string }
  const exists =
    details.statusCode === "409" || details.code === "ResourceAlreadyExists" || /already exists|duplicate/i.test(error.message)
  if (!exists) throw toServerError(error)
}

function isPlanUpload(request: OutboxRequest): boolean {
  return request.collection === "floors" && request.body.plan === PLAN_ON_DEVICE
}

// Правило «последняя правка побеждает», отдельно для каждого поля. Если кто-то поменял
// то же поле позже этой правки, её значение уже устарело и на сервер не идёт. Остальные
// поля применяются. Строки истории пишем всегда: журнал показывает все правки по времени,
// и последняя строка совпадает с тем, что осталось в задаче.
async function dropOutdatedFields(item: OutboxItem): Promise<OutboxRequest[]> {
  const [edit, ...historyRows] = item.requests
  const laterEdits = unwrap(
    await supabase
      .from("task_history")
      .select("field")
      .eq("task", edit.id)
      .gt("changed_at", item.taskEditTime!)
      .abortSignal(timeout(PULL_TIMEOUT)),
  )
  if (laterEdits.length === 0) return item.requests

  // Локальная копия задачи могла разойтись с сервером: заберём все задачи заново.
  await db.meta.delete("cursor:tasks")

  // Точка на плане в истории одна строка, а в задаче два поля.
  const laterFields = new Set(laterEdits.flatMap((row) => (row.field === "plan_point" ? ["plan_x", "plan_y"] : [row.field])))
  const body = Object.fromEntries(
    Object.entries(edit.body).filter(
      ([field]) => !laterFields.has(field) && field !== "updated_by" && field !== "client_updated_at",
    ),
  )
  return Object.keys(body).length > 0 ? [{ ...edit, body }, ...historyRows] : historyRows
}

// Сервер уже принял этот элемент, а ответ потерялся при обрыве связи. При повторе ID
// записей те же, сервер отвечает «такой ID уже есть» (код 23505) и откатывает повтор целиком.
function alreadyOnServer(error: unknown): boolean {
  return toServerError(error).code === "23505"
}

function failureText(error: unknown): string {
  // P0002: запись для правки не найдена, 23503: удалена запись, на которую ссылается эта.
  const { code } = toServerError(error)
  return code === "P0002" || code === "23503" ? "Запись уже удалена на сервере." : "Сервер не принял это изменение."
}

// --- Получение данных ---

async function pullEverything(): Promise<void> {
  const reconcile = Date.now() >= nextReconcileAt
  if (reconcile) nextReconcileAt = Date.now() + RECONCILE_INTERVAL
  for (const name of SYNCED_COLLECTIONS) {
    await pullCollection(name, reconcile)
  }
  await renewPhotoUrls()
  await db.meta.put({ key: "lastSyncAt", value: new Date().toISOString() })
}

interface SyncedRecord {
  id: string
  updated: string
  [field: string]: unknown
}

// Все записи по условию, страницами: за один запрос Supabase отдаёт не больше 1000.
async function fetchAll(table: string, columns: string, since: string): Promise<SyncedRecord[]> {
  const rows: SyncedRecord[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns)
    if (since) query = query.gte("updated", since)
    const page = unwrap(
      await query
        .order("updated")
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
        .abortSignal(timeout(PULL_TIMEOUT)),
    ) as unknown as SyncedRecord[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function pullCollection(name: string, reconcile: boolean): Promise<void> {
  const cursorKey = `cursor:${name}`
  const cursor = (await db.meta.get(cursorKey))?.value ?? ""
  const remote = SERVER_TABLES[name]

  // Только то, что изменилось с прошлого раза, плюс запас в минуту: запись могла получить
  // время раньше, а сохраниться позже других. Такие записи придут повторно, это безвредно.
  const since = cursor ? new Date(new Date(cursor).getTime() - CURSOR_OVERLAP).toISOString() : ""
  const serverRows = await fetchAll(remote, "*", since)
  const serverIds = reconcile ? await fetchAll(remote, "id", "") : null
  // Вход могли сбросить, пока шли запросы: тогда списки пришли пустыми, как гостю.
  if (!isLoggedIn()) throw new SessionRejectedError("Вход сброшен во время синхронизации")
  const changed = serverRows.map((row) => fromServer(row) as SyncedRecord)

  const table = db.table<SyncedRecord, string>(name)
  await db.transaction("rw", table, db.outbox, db.meta, async () => {
    const outbox = await db.outbox.toArray()
    const queued = outbox.flatMap((item) => item.requests).filter((request) => request.collection === name)

    const existing = await table.bulkGet(changed.map((record) => record.id))
    const fresh = changed
      .filter((record, index) => existing[index]?.updated !== record.updated)
      .map((record) => {
        const edits = queued.filter((request) => request.method === "update" && request.id === record.id)
        if (edits.length === 0) return record
        // Поверх данных сервера кладём неотправленные правки, чтобы они не исчезли с экрана.
        // Отметка в updated: запись теперь не совпадает с серверной, и если от правки
        // откажутся или она проиграет конфликт, следующая синхронизация её перезапишет.
        return Object.assign({ ...record }, ...edits.map((request) => request.body), { updated: `${record.updated}*` })
      })
    await table.bulkPut(fresh)

    // Удаляем то, чего на сервере больше нет. Записи из очереди туда просто ещё не дошли.
    if (serverIds) {
      const keep = new Set([
        ...serverIds.map((record) => record.id),
        ...queued.filter((request) => request.method === "create").map((request) => request.id),
      ])
      const localIds = await table.toCollection().primaryKeys()
      await table.bulkDelete(localIds.filter((id) => !keep.has(id)))
    }

    // Курсор хранит время сервера как есть, с точностью до микросекунд.
    const last = serverRows.at(-1)
    if (last) await db.meta.put({ key: cursorKey, value: last.updated })
  })
}

// --- Ссылки на фото ---

// Файлы фото закрыты, открыть их можно только по подписанной ссылке. Получаем ссылки
// заранее, пока есть связь: тогда фото открываются сразу, а просмотренные и без связи.
async function renewPhotoUrls(): Promise<void> {
  const photos = await db.photos.filter((photo) => !photo.localFile && Boolean(photo.file)).toArray()
  const known = new Map((await db.photoUrls.toArray()).map((row) => [row.path, row.expiresAt]))
  const renewAt = Date.now() + PHOTO_URL_RENEW_BEFORE
  const paths = [...new Set(photos.map((photo) => photo.file))].filter((path) => (known.get(path) ?? 0) < renewAt)

  for (let i = 0; i < paths.length; i += 100) {
    const expiresAt = Date.now() + PHOTO_URL_LIFETIME * 1000
    const signed = unwrap(await supabase.storage.from("photos").createSignedUrls(paths.slice(i, i + 100), PHOTO_URL_LIFETIME))
    const rows = signed
      .filter((row) => row.path && row.signedUrl && !row.error)
      .map((row) => ({ path: row.path!, url: row.signedUrl!, expiresAt }))
    await db.photoUrls.bulkPut(rows)
  }
}

// --- Файлы планов ---

let downloadingPlans = false

// Скачивает на устройство планы этажей, чтобы они открывались и без связи.
// При ошибке связи просто останавливается: продолжит после следующей синхронизации.
async function downloadPlans(): Promise<void> {
  if (downloadingPlans) return
  downloadingPlans = true
  try {
    for (const floor of await db.floors.toArray()) {
      if (floor.plan === PLAN_ON_DEVICE) continue // новый файл ещё только идёт на сервер

      const saved = await db.plans.get(floor.id)
      if (!floor.plan) {
        if (saved) await db.plans.delete(floor.id)
        continue
      }
      if (saved?.fileName === floor.plan) continue

      const { data: file, error } = await supabase.storage
        .from("plans")
        .download(floor.plan, {}, { signal: timeout(PLAN_TIMEOUT) })
      if (error) {
        if (isConnectionProblem(error)) throw error
        continue // файла нет на сервере: скачивать нечего
      }
      if (!isLoggedIn()) return // пользователь вышел, пока шла загрузка
      await db.plans.put({ floor: floor.id, fileName: floor.plan, file })
    }
  } catch (error) {
    console.warn("План не загружен, повторим позже", error)
  } finally {
    downloadingPlans = false
  }
}

// --- Действия с экрана очереди ---

export async function retryOutboxItem(id: number): Promise<void> {
  await db.outbox.update(id, { failed: false, error: undefined })
  await requestSync()
}

// Отказ от изменения. Сбрасываем отметки и забираем с сервера всё заново:
// так с устройства уйдёт и само изменение, и его следы в истории.
export async function discardOutboxItem(id: number): Promise<void> {
  await db.transaction("rw", db.outbox, db.meta, async () => {
    await db.outbox.delete(id)
    await db.meta.where("key").startsWith("cursor:").delete()
  })
  nextReconcileAt = 0
  await requestSync()
}
