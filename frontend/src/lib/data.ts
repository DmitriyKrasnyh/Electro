import { currentUserId } from "./auth"
import { db, PLAN_ON_DEVICE, type LocalPhoto, type LocalPlan, type OutboxItem } from "./db"
import { NotFoundError, formatDate, hasPlanPoint, nameById } from "./format"
import { requestSync } from "./sync"
import {
  CABLE_STAGE_LABELS,
  HISTORY_FIELD_LABELS,
  PHOTO_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  SYSTEM_LABELS,
  type CableLine,
  type CableStage,
  type GroundMeasurement,
  type ChecklistItem,
  type Floor,
  type Photo,
  type PhotoType,
  type ProjectObject,
  type Room,
  type Task,
  type TaskHistory,
  type TaskPriority,
  type TaskStatus,
  type TaskSystem,
  type User,
} from "../types"

// Все чтения и записи данных проходят через этот файл, и работает он только с локальной
// базой. Запись сразу попадает на устройство и в очередь отправки, поэтому связь для
// неё не нужна. Отправкой на сервер занимается lib/sync.ts.

// Справочники: нужны почти на каждом экране, чтобы показывать имена вместо ID.
export interface Directories {
  floors: Floor[]
  rooms: Room[]
  users: User[]
}

// Поля задачи, которые меняет пользователь. Служебные поля заполняет этот файл.
type EditableField =
  | "floor"
  | "room"
  | "system"
  | "title"
  | "description"
  | "status"
  | "blocked"
  | "blocked_reason"
  | "priority"
  | "due_date"
  | "assignee"
  | "marking"
  | "checklist"
  | "plan_x"
  | "plan_y"
  | "depends_on"

export type TaskChanges = Partial<Pick<Task, EditableField>>

// Поля формы создания и редактирования задачи.
export type TaskFields = Pick<
  Task,
  "system" | "floor" | "title" | "room" | "assignee" | "marking" | "priority" | "due_date" | "description"
>

// Фото с готовыми адресами: экранам не нужно знать, где оно лежит и как устроен доступ.
export interface PhotoWithUrls extends Photo {
  thumbUrl: string
  fullUrl: string
  pending: boolean // ещё не отправлено на сервер
}

// --- Чтение ---

// Числа сортируем как числа: помещение 201 идёт раньше помещения 1000.
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ru", { numeric: true })

export async function getDirectories(): Promise<Directories> {
  const [floors, rooms, users] = await Promise.all([db.floors.toArray(), db.rooms.toArray(), db.users.toArray()])
  return {
    floors: floors.sort((a, b) => a.order - b.order || byName(a, b)),
    rooms: rooms.sort(byName),
    users: users.sort(byName),
  }
}

// В MVP один объект на всё приложение. null, если его ещё не создали в админке.
export async function getProjectObject(): Promise<ProjectObject | null> {
  return (await db.objects.orderBy("created").first()) ?? null
}

// Все задачи или задачи одной системы.
export function getTasks(system?: TaskSystem): Promise<Task[]> {
  return system ? db.tasks.where("system").equals(system).toArray() : db.tasks.toArray()
}

export async function getTask(id: string): Promise<Task> {
  const task = await db.tasks.get(id)
  if (!task) throw new NotFoundError()
  return task
}

// История задачи, новые записи сверху. Порядок по времени самой правки,
// а не по времени получения сервером.
export async function getHistory(taskId: string): Promise<TaskHistory[]> {
  const rows = await db.task_history.where("task").equals(taskId).toArray()
  return rows.sort((a, b) => b.changed_at.localeCompare(a.changed_at))
}

// Фото задачи, новые сверху.
export async function getPhotos(taskId: string): Promise<PhotoWithUrls[]> {
  const photos = await db.photos.where("task").equals(taskId).toArray()
  const signed = await db.photoUrls.bulkGet(photos.map((photo) => photo.file))
  const urls = new Map(signed.filter((row) => row !== undefined).map((row) => [row.path, row.url]))
  return photos
    .sort((a, b) => b.taken_at.localeCompare(a.taken_at) || b.created.localeCompare(a.created))
    .map((photo) => withUrls(photo, urls.get(photo.file)))
}

// Всё для экрана плана: этаж, файл плана и задачи этого этажа.
export async function getPlanData(floorId: string) {
  const [floor, plan, tasks, directories] = await Promise.all([
    db.floors.get(floorId),
    db.plans.get(floorId),
    db.tasks.where("floor").equals(floorId).toArray(),
    getDirectories(),
  ])
  if (!floor) throw new NotFoundError()
  return { floor, plan, tasks, directories }
}

// Время последней успешной синхронизации, пустая строка, если её ещё не было.
export async function getLastSyncTime(): Promise<string> {
  return (await db.meta.get("lastSyncAt"))?.value ?? ""
}

export function getOutbox(): Promise<OutboxItem[]> {
  return db.outbox.toArray()
}

export async function getOutboxCounts(): Promise<{ pending: number; failed: number }> {
  const items = await db.outbox.toArray()
  const failed = items.filter((item) => item.failed).length
  return { pending: items.length - failed, failed }
}

// --- Запись ---

// dependsOn: задача, которую нужно сдать раньше этой (кнопка «Создать следующую задачу»).
export async function createTask(
  fields: TaskFields,
  planPoint?: { x: number; y: number },
  dependsOn = "",
): Promise<Task> {
  const now = dateTimeForDb(new Date())
  const userId = currentUserId()
  const serverFields = {
    ...fields,
    status: "not_started" as const,
    blocked: false,
    blocked_reason: "",
    plan_x: planPoint?.x ?? 0,
    plan_y: planPoint?.y ?? 0,
    depends_on: dependsOn,
    created_by: userId,
    updated_by: userId,
    client_updated_at: now,
  }
  const task: Task = { ...serverFields, id: newId(), checklist: null, created: now, updated: now }
  // Отдельная строка хранит настоящее время создания: задача, созданная без связи,
  // попадёт на сервер позже, и поле created покажет уже время получения.
  const createdRow = newHistoryRow(task.id, "created", "", "", now)

  await db.transaction("rw", db.tasks, db.task_history, db.outbox, async () => {
    await db.tasks.add(task)
    await db.task_history.add(createdRow)
    await addToOutbox({
      label: `Новая задача: ${task.title}`,
      requests: [{ method: "create", collection: "tasks", id: task.id, body: serverFields }, historyRequest(createdRow)],
    })
  })
  void requestSync()
  return task
}

// Сохраняет только реально изменившиеся поля и пишет по строке истории на каждое.
export async function updateTask(task: Task, changes: TaskChanges, directories: Directories): Promise<void> {
  // Точка на плане относится к этажу: на другом этаже она указывала бы не туда.
  const allChanges =
    changes.floor && changes.floor !== task.floor && hasPlanPoint(task) ? { ...changes, plan_x: 0, plan_y: 0 } : changes

  const changedFields = (Object.keys(allChanges) as EditableField[]).filter(
    (field) => !isSameValue(field, task[field], allChanges[field]),
  )
  if (changedFields.length === 0) return

  const now = dateTimeForDb(new Date())
  const body = {
    ...Object.fromEntries(changedFields.map((field) => [field, allChanges[field]])),
    updated_by: currentUserId(),
    client_updated_at: now,
  }
  // В истории для цепочки пишем названия задач, а не их ID.
  const taskTitle = async (id: unknown) => (id ? ((await db.tasks.get(id as string))?.title ?? "") : "")
  const rows: TaskHistory[] = []
  for (const field of changedFields) {
    if (field === "plan_x" || field === "plan_y") continue
    const [oldValue, newValue] =
      field === "depends_on"
        ? [await taskTitle(task.depends_on), await taskTitle(allChanges.depends_on)]
        : historyValues(field, task[field], allChanges[field], directories)
    rows.push(newHistoryRow(task.id, field, oldValue, newValue, now))
  }
  // Две координаты в истории считаем одной правкой.
  if (changedFields.includes("plan_x") || changedFields.includes("plan_y")) {
    const newPoint = { plan_x: allChanges.plan_x ?? task.plan_x, plan_y: allChanges.plan_y ?? task.plan_y }
    rows.push(newHistoryRow(task.id, "plan_point", planPointText(task), planPointText(newPoint), now))
  }

  await db.transaction("rw", db.tasks, db.task_history, db.outbox, async () => {
    await db.tasks.update(task.id, { ...body, updated: now })
    await db.task_history.bulkAdd(rows)
    await addToOutbox({
      label: `${task.title}: ${rows.map((row) => HISTORY_FIELD_LABELS[row.field]).join(", ")}`,
      requests: [{ method: "update", collection: "tasks", id: task.id, body }, ...rows.map(historyRequest)],
      taskEditTime: now,
    })
  })
  void requestSync()
}

function planPointText(point: Pick<Task, "plan_x" | "plan_y">): string {
  return hasPlanPoint(point) ? `${Math.round(point.plan_x)}%, ${Math.round(point.plan_y)}%` : ""
}

// Автор подставляется автоматически, а время съёмки передаёт экран.
export async function createPhoto(
  taskId: string,
  file: File,
  type: PhotoType,
  comment: string,
  takenAt: Date,
): Promise<void> {
  const now = dateTimeForDb(new Date())
  const body = { task: taskId, type, comment, author: currentUserId(), taken_at: dateTimeForDb(takenAt) }
  const id = newId()
  const photo: LocalPhoto = { ...body, id, file: "", localFile: file, created: now, updated: now }
  // Путь в хранилище: ID фото и расширение по формату.
  const filePath = `${id}.${PLAN_FILE_TYPES[file.type] ?? "jpg"}`
  const task = await db.tasks.get(taskId)

  await db.transaction("rw", db.photos, db.outbox, async () => {
    await db.photos.add(photo)
    await addToOutbox({
      label: `Фото (${PHOTO_TYPE_LABELS[type]}): ${task?.title ?? ""}`,
      requests: [{ method: "create", collection: "photos", id: photo.id, body, filePath }],
    })
  })
  void requestSync()
}

export async function createFloor(objectId: string, name: string, order: number): Promise<void> {
  const now = dateTimeForDb(new Date())
  const body = { object: objectId, name, order }
  const floor: Floor = { ...body, id: newId(), plan: "", created: now, updated: now }

  await db.transaction("rw", db.floors, db.outbox, async () => {
    await db.floors.add(floor)
    await addToOutbox({
      label: `Новый этаж: ${name}`,
      requests: [{ method: "create", collection: "floors", id: floor.id, body }],
    })
  })
  void requestSync()
}

// Новый план сразу доступен на этом устройстве, а на сервер уходит через очередь.
export async function uploadFloorPlan(floor: Floor, file: File): Promise<void> {
  // Понятное имя: исходные имена файлов бывают любыми, а расширение важно для сервера.
  const extension = PLAN_FILE_TYPES[file.type]
  const named = new File([file], `plan.${extension}`, { type: file.type })
  // У каждой новой версии плана свой путь: старый файл не перезаписывается, и устройства,
  // которые ещё не скачали новый, по-прежнему могут открыть прежний.
  const filePath = `${floor.id}/${newId()}.${extension}`

  await db.transaction("rw", db.floors, db.plans, db.outbox, async () => {
    await db.floors.update(floor.id, { plan: PLAN_ON_DEVICE, updated: dateTimeForDb(new Date()) })
    await db.plans.put({ floor: floor.id, fileName: "", file: named })
    await addToOutbox({
      label: `План этажа: ${floor.name}`,
      requests: [{ method: "update", collection: "floors", id: floor.id, body: { plan: PLAN_ON_DEVICE }, filePath }],
    })
  })
  void requestSync()
}

// Сохраняет картинку, нарисованную из PDF. Если файл плана за это время сменился, она не нужна.
export async function savePlanImage(plan: LocalPlan, image: Blob, pages: number): Promise<void> {
  await db.transaction("rw", db.plans, async () => {
    const current = await db.plans.get(plan.floor)
    if (current?.fileName === plan.fileName) await db.plans.update(plan.floor, { image, pages })
  })
}

// Форматы плана, которые принимает сервер, и расширения для них. Подходят и для фото.
export const PLAN_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const PLAN_MAX_SIZE = 50 * 1024 * 1024 // как в настройках сервера

// Проверяет файл до сохранения. Возвращает текст ошибки или пустую строку.
export async function checkPlanFile(file: File): Promise<string> {
  if (!PLAN_FILE_TYPES[file.type]) return "Подходят только PDF, JPG, PNG или WebP."
  if (file.size > PLAN_MAX_SIZE) return "Файл слишком большой: можно не больше 50 МБ."
  // Настоящий PDF начинается с метки %PDF. Без неё сервер всё равно не примет файл.
  if (file.type === "application/pdf" && (await file.slice(0, 5).text()) !== "%PDF-") {
    return "Этот файл не похож на PDF."
  }
  return ""
}

export async function renameFloor(id: string, name: string): Promise<void> {
  await db.transaction("rw", db.floors, db.outbox, async () => {
    await db.floors.update(id, { name, updated: dateTimeForDb(new Date()) })
    await addToOutbox({
      label: `Новое название этажа: ${name}`,
      requests: [{ method: "update", collection: "floors", id, body: { name } }],
    })
  })
  void requestSync()
}

export async function createRoom(floorId: string, name: string): Promise<void> {
  const now = dateTimeForDb(new Date())
  const body = { floor: floorId, name }
  const room: Room = { ...body, id: newId(), plan_x: 0, plan_y: 0, created: now, updated: now }

  await db.transaction("rw", db.rooms, db.outbox, async () => {
    await db.rooms.add(room)
    await addToOutbox({
      label: `Новое помещение: ${name}`,
      requests: [{ method: "create", collection: "rooms", id: room.id, body }],
    })
  })
  void requestSync()
}

// Точка помещения на плане этажа. По ней на плане показывается номер помещения.
export async function setRoomPoint(room: Room, x: number, y: number): Promise<void> {
  const body = { plan_x: x, plan_y: y }
  await db.transaction("rw", db.rooms, db.outbox, async () => {
    await db.rooms.update(room.id, { ...body, updated: dateTimeForDb(new Date()) })
    await addToOutbox({
      label: `Точка помещения на плане: ${room.name}`,
      requests: [{ method: "update", collection: "rooms", id: room.id, body }],
    })
  })
  void requestSync()
}

export async function renameRoom(id: string, name: string): Promise<void> {
  await db.transaction("rw", db.rooms, db.outbox, async () => {
    await db.rooms.update(id, { name, updated: dateTimeForDb(new Date()) })
    await addToOutbox({
      label: `Новое название помещения: ${name}`,
      requests: [{ method: "update", collection: "rooms", id, body: { name } }],
    })
  })
  void requestSync()
}

// --- Кабельный журнал ---

// Все линии в порядке проектного журнала и справочники для имён этажей, помещений, людей.
export async function getCableJournal() {
  const [lines, directories, object] = await Promise.all([db.cable_lines.toArray(), getDirectories(), getProjectObject()])
  return { lines: lines.sort((a, b) => a.sort - b.sort), directories, object }
}

// Ставит или снимает отметку этапа сразу у нескольких линий (или у одной).
// Это одно действие человека, поэтому и в очереди оно одно.
// Состояние кабеля: не проведён → проведён → выведен в подрозетник. «Выведен в подрозетник»
// возможен только у проведённого кабеля, поэтому он ставит и «проведён», а снятие «проведён»
// снимает и его.
export async function setCableStage(lines: CableLine[], stage: CableStage, done: boolean): Promise<void> {
  const targets = lines.filter((line) => Boolean(line[`${stage}_at`]) !== done)
  if (targets.length === 0) return

  const now = dateTimeForDb(new Date())
  const user = currentUserId()
  const mark = (name: CableStage) => ({ [`${name}_at`]: now, [`${name}_by`]: user })
  const clear = (name: CableStage) => ({ [`${name}_at`]: "", [`${name}_by`]: "" })
  const bodyFor = (line: CableLine): Record<string, string> => {
    if (done) return { ...(stage === "box" && !line.laid_at ? mark("laid") : {}), ...mark(stage) }
    return { ...clear(stage), ...(stage === "laid" && line.box_at ? clear("box") : {}) }
  }
  const what = done ? CABLE_STAGE_LABELS[stage] : `снята отметка «${CABLE_STAGE_LABELS[stage]}»`
  const label = targets.length === 1 ? `${targets[0].marking}: ${what}` : `Линий: ${targets.length}, ${what}`

  await db.transaction("rw", db.cable_lines, db.outbox, async () => {
    const requests = []
    for (const line of targets) {
      const body = bodyFor(line)
      await db.cable_lines.update(line.id, { ...body, updated: now })
      requests.push({ method: "update" as const, collection: "cable_lines", id: line.id, body })
    }
    await addToOutbox({ label, requests })
  })
  void requestSync()
}

// --- Цепочки задач ---

// Предыдущая задача, которая ещё не сдана: пока она не сдана, эта ждёт.
export function waitingOn(task: Task, tasksById: Map<string, Task>): Task | null {
  const previous = task.depends_on ? tasksById.get(task.depends_on) : undefined
  return previous && previous.status !== "done" ? previous : null
}

// Задачи, которые можно поставить предыдущими: кроме самой задачи и тех, что уже ждут её
// (напрямую или через другие), иначе цепочка замкнулась бы в кольцо.
export function chainCandidates(task: Task, tasks: Task[]): Task[] {
  const after = new Set([task.id])
  let grew = true
  while (grew) {
    grew = false
    for (const other of tasks) {
      if (other.depends_on && after.has(other.depends_on) && !after.has(other.id)) {
        after.add(other.id)
        grew = true
      }
    }
  }
  return tasks.filter((other) => !after.has(other.id))
}

// --- Заземление: замеры сопротивления ---

export async function getGroundMeasurements() {
  const [measurements, directories, object] = await Promise.all([
    db.ground_measurements.toArray(),
    getDirectories(),
    getProjectObject(),
  ])
  return { measurements: measurements.sort((a, b) => b.measured_at.localeCompare(a.measured_at)), directories, object }
}

export type MeasurementFields = Pick<GroundMeasurement, "floor" | "room" | "place" | "resistance" | "norm" | "instrument" | "comment">

export async function createMeasurement(objectId: string, fields: MeasurementFields): Promise<void> {
  const now = dateTimeForDb(new Date())
  const body = { ...fields, object: objectId, measured_at: now, measured_by: currentUserId() }
  const measurement: GroundMeasurement = { ...body, id: newId(), created: now, updated: now }
  await db.transaction("rw", db.ground_measurements, db.outbox, async () => {
    await db.ground_measurements.add(measurement)
    await addToOutbox({
      label: `Замер заземления: ${fields.place}, ${fields.resistance} Ом`,
      requests: [{ method: "create", collection: "ground_measurements", id: measurement.id, body }],
    })
  })
  void requestSync()
}

// Удалить ошибочный замер может только администратор: это проверяет сервер.
export async function deleteMeasurement(measurement: GroundMeasurement): Promise<void> {
  await db.transaction("rw", db.ground_measurements, db.outbox, async () => {
    await db.ground_measurements.delete(measurement.id)
    await addToOutbox({
      label: `Удалён замер: ${measurement.place}`,
      requests: [{ method: "delete", collection: "ground_measurements", id: measurement.id, body: {} }],
    })
  })
  void requestSync()
}

// --- Вспомогательные функции ---

// Время в том же виде, что и время с сервера после lib/supabase.ts: 2026-11-08T10:00:00.000Z.
function dateTimeForDb(date: Date): string {
  return date.toISOString()
}

// ID создаёт клиент (15 символов a-z0-9). Запись сразу получает постоянный ID,
// а при повторной отправке сервер распознаёт её и не создаёт дубль.
export function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

function addToOutbox(item: Pick<OutboxItem, "label" | "requests" | "taskEditTime">) {
  return db.outbox.add({ ...item, failed: false, createdAt: dateTimeForDb(new Date()) })
}

function newHistoryRow(task: string, field: string, oldValue: string, newValue: string, time: string): TaskHistory {
  return {
    id: newId(),
    task,
    user: currentUserId(),
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_at: time,
    created: time,
    updated: time,
  }
}

function historyRequest(row: TaskHistory) {
  const { id, task, user, field, old_value, new_value, changed_at } = row
  return {
    method: "create" as const,
    collection: "task_history",
    id,
    body: { task, user, field, old_value, new_value, changed_at },
  }
}

// Неотправленное фото показываем из локального файла. Адрес такого файла занимает память,
// поэтому освобождаем его, как только фото оказалось на сервере.
const localPhotoUrls = new Map<string, string>()

// Ссылки на фото с сервера подписаны и действуют сутки (см. lib/sync.ts). Если ссылки
// ещё нет, берём адрес без подписи: просмотренное раньше фото service worker найдёт
// в кэше и по нему.
function withUrls(photo: LocalPhoto, signedUrl: string | undefined): PhotoWithUrls {
  const localUrl = localPhotoUrls.get(photo.id)
  if (photo.localFile) {
    const url = localUrl ?? URL.createObjectURL(photo.localFile)
    localPhotoUrls.set(photo.id, url)
    return { ...photo, thumbUrl: url, fullUrl: url, pending: true }
  }
  if (localUrl) {
    URL.revokeObjectURL(localUrl)
    localPhotoUrls.delete(photo.id)
  }
  // Уменьшенные копии в Supabase есть только на платном тарифе, поэтому в галерее
  // показываем сам снимок. Он и так сжат на телефоне перед отправкой.
  const url = signedUrl ?? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/sign/photos/${photo.file}`
  return { ...photo, thumbUrl: url, fullUrl: url, pending: false }
}

function isSameValue(field: EditableField, oldValue: unknown, newValue: unknown): boolean {
  // У срока важна только дата, время в нём ничего не значит.
  if (field === "due_date") {
    return String(oldValue).slice(0, 10) === String(newValue).slice(0, 10)
  }
  return JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)
}

// В истории храним готовый текст, а не ID и коды: запись останется понятной,
// даже если помещение позже переименуют или удалят.
function historyValues(
  field: EditableField,
  oldValue: unknown,
  newValue: unknown,
  directories: Directories,
): [string, string] {
  if (field === "checklist") {
    const oldList = (oldValue ?? []) as ChecklistItem[]
    const newList = (newValue ?? []) as ChecklistItem[]
    return [checklistDifference(oldList, newList), checklistDifference(newList, oldList)]
  }
  return [historyText(field, oldValue, directories), historyText(field, newValue, directories)]
}

function historyText(field: EditableField, value: unknown, directories: Directories): string {
  switch (field) {
    case "status":
      return STATUS_LABELS[value as TaskStatus]
    case "priority":
      return PRIORITY_LABELS[value as TaskPriority]
    case "system":
      return SYSTEM_LABELS[value as TaskSystem]
    case "floor":
      return nameById(directories.floors, value as string)
    case "room":
      return nameById(directories.rooms, value as string)
    case "assignee":
      return nameById(directories.users, value as string)
    case "blocked":
      return value ? "Да" : "Нет"
    case "due_date":
      return formatDate(value as string)
    default:
      return String(value ?? "")
  }
}

// Пункты чек-листа, которых нет в другой версии: в истории видно только то, что изменилось.
function checklistDifference(list: ChecklistItem[], other: ChecklistItem[]): string {
  return list
    .filter((item) => !other.some((o) => o.text === item.text && o.done === item.done))
    .map((item) => `${item.done ? "☑" : "☐"} ${item.text}`)
    .join("; ")
}
