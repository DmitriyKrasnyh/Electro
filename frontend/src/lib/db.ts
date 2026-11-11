import Dexie, { type Table } from "dexie"
import type {
  CableLine,
  Floor,
  GroundMeasurement,
  Photo,
  ProjectDocument,
  ProjectObject,
  Room,
  Task,
  TaskHistory,
  User,
} from "../types"

// Локальная база на устройстве (IndexedDB). Экраны читают и пишут только сюда,
// поэтому приложение работает без связи. С сервером её выравнивает lib/sync.ts.

// Фото, которое ещё не отправлено: файл лежит прямо в локальной базе.
export interface LocalPhoto extends Photo {
  localFile?: File
}

// Один запрос к серверу внутри элемента очереди.
export interface OutboxRequest {
  method: "create" | "update" | "delete"
  collection: string // таблица на устройстве
  id: string
  body: Record<string, unknown>
  // Путь в хранилище для файла, который уходит вместе с запросом (фото или план).
  // Задаётся заранее: при повторной отправке файл ляжет туда же, а не в новую копию.
  filePath?: string
}

// Файл плана этажа. Хранится на устройстве, потому что план нужен и в подвале.
export interface LocalPlan {
  floor: string
  fileName: string // путь к файлу в хранилище, пустой, пока файл туда не отправлен
  file: Blob
  // PDF при первом открытии рисуем в картинку и сохраняем: дальше план открывается сразу.
  image?: Blob
  pages?: number
}

// Значение поля plan у этажа, пока новый файл плана лежит только на устройстве.
export const PLAN_ON_DEVICE = "on-device"

// Ссылка на фото с сервера. Файлы закрыты, поэтому ссылка подписана и действует
// ограниченное время. Синхронизация обновляет ссылки заранее.
export interface PhotoUrl {
  path: string
  url: string
  expiresAt: number // миллисекунды, как Date.now()
}

// Файл документа, однажды открытый на этом устройстве: дальше открывается и без сети.
export interface DocumentFile {
  id: string // ID документа
  path: string // путь в хранилище: если документ заменят, старый файл не подойдёт
  file: Blob
}

// Элемент очереди: одно действие пользователя, которое ждёт отправки.
// Все его запросы выполняются на сервере одной транзакцией.
export interface OutboxItem {
  id?: number // порядковый номер: отправляем строго в том порядке, в каком действовали
  label: string // что показать человеку на экране очереди
  createdAt: string
  failed: boolean // сервер отказал, и повтор сам по себе не поможет
  error?: string
  requests: OutboxRequest[]
  // Есть только у правок задачи: время правки для правила «последняя правка побеждает».
  taskEditTime?: string
}

class AppDatabase extends Dexie {
  users!: Table<User, string>
  objects!: Table<ProjectObject, string>
  floors!: Table<Floor, string>
  rooms!: Table<Room, string>
  tasks!: Table<Task, string>
  task_history!: Table<TaskHistory, string>
  photos!: Table<LocalPhoto, string>
  plans!: Table<LocalPlan, string>
  photoUrls!: Table<PhotoUrl, string>
  cable_lines!: Table<CableLine, string>
  ground_measurements!: Table<GroundMeasurement, string>
  documents!: Table<ProjectDocument, string>
  documentFiles!: Table<DocumentFile, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    // Новое имя базы после переезда на Supabase: данные от прежнего сервера
    // с этими не совпадают и на устройстве больше не нужны (см. main.tsx).
    super("electro-supabase")
    // Таблицы данных названы как таблицы в Supabase, кроме users (там profiles).
    // В строках перечислены поля для поиска.
    this.version(1).stores({
      users: "id",
      objects: "id, created",
      floors: "id",
      rooms: "id",
      tasks: "id, system, floor",
      task_history: "id, task",
      photos: "id, task",
      plans: "floor",
      photoUrls: "path",
      outbox: "++id",
      meta: "key",
    })
    // Кабельный журнал. Новая версия добавляет только новую таблицу, остальное не трогает.
    this.version(2).stores({
      cable_lines: "id, system",
    })
    // Замеры заземления и документы объекта.
    this.version(3).stores({
      ground_measurements: "id",
      documents: "id",
      documentFiles: "id",
    })
  }
}

// База от прежнего сервера (PocketBase). Стирается при первом запуске новой версии.
export const OLD_DATABASE_NAME = "electro"

export const db = new AppDatabase()

// Коллекции, которые копируются с сервера на устройство.
export const SYNCED_COLLECTIONS = [
  "users",
  "objects",
  "floors",
  "rooms",
  "tasks",
  "task_history",
  "photos",
  "cable_lines",
  "ground_measurements",
  "documents",
]

// Стирает с устройства все данные. Вызывается при выходе из приложения.
export async function clearLocalData(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()))
  // Кэш просмотренных фото. По адресу без HTTPS браузер не даёт доступа к кэшу.
  if ("caches" in window) await caches.delete("photos")
}
