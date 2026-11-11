import { currentUserId } from "./auth"
import { getProjectObject, newId } from "./data"
import { db } from "./db"
import { supabase, toServerError, unwrap } from "./supabase"
import { requestSync } from "./sync"
import type { ProjectDocument } from "../types"

// Документы объекта (PDF). Список копируется на устройство вместе с остальными данными.
// Сам файл скачивается при первом открытии и дальше открывается без сети.
// Добавляет и удаляет документы администратор, и только со связью: файлы большие,
// а очередь отправки рассчитана на быстрые правки бригады.

export const DOCUMENT_MAX_SIZE = 50 * 1024 * 1024 // как в настройках хранилища documents

export async function getDocuments() {
  const [documents, saved] = await Promise.all([db.documents.toArray(), db.documentFiles.toArray()])
  const savedPaths = new Map(saved.map((item) => [item.id, item.path]))
  return documents
    .sort((a, b) => a.title.localeCompare(b.title, "ru", { numeric: true }))
    .map((document) => ({ ...document, onDevice: savedPaths.get(document.id) === document.file }))
}

export async function getDocument(id: string): Promise<ProjectDocument | undefined> {
  return db.documents.get(id)
}

// Проверяет файл до загрузки. Возвращает текст ошибки или пустую строку.
export async function checkDocumentFile(file: File): Promise<string> {
  if (file.type !== "application/pdf") return "Подходят только файлы PDF."
  if (file.size > DOCUMENT_MAX_SIZE) return "Файл слишком большой: можно не больше 50 МБ."
  if ((await file.slice(0, 5).text()) !== "%PDF-") return "Этот файл не похож на PDF."
  return ""
}

export async function uploadDocument(file: File, title: string): Promise<void> {
  const object = await getProjectObject()
  if (!object) throw new Error("Объект ещё не создан")
  const id = newId()
  const path = `${id}.pdf`

  const upload = await supabase.storage.from("documents").upload(path, file, { contentType: "application/pdf" })
  if (upload.error) throw toServerError(upload.error)
  const body = { object: object.id, title, file: path, size: file.size, created_by: currentUserId() }
  unwrap(await supabase.rpc("apply_changes", { requests: [{ method: "create", table: "documents", id, body }] }))

  // У того, кто загрузил, файл сразу есть на устройстве.
  await db.documentFiles.put({ id, path, file })
  await requestSync()
}

export async function deleteDocument(document: ProjectDocument): Promise<void> {
  unwrap(await supabase.rpc("apply_changes", { requests: [{ method: "delete", table: "documents", id: document.id }] }))
  // Файл в хранилище больше никому не нужен. Если удалить его не вышло, документ из списка
  // всё равно убран, а лишний файл администратор удалит в разделе Storage.
  const removed = await supabase.storage.from("documents").remove([document.file])
  if (removed.error) console.warn("Файл документа не удалён из хранилища", removed.error)
  await db.transaction("rw", db.documents, db.documentFiles, async () => {
    await db.documents.delete(document.id)
    await db.documentFiles.delete(document.id)
  })
}

// Файл документа: с устройства, а если его там нет, скачиваем и сохраняем.
export async function getDocumentFile(document: ProjectDocument): Promise<Blob> {
  const saved = await db.documentFiles.get(document.id)
  if (saved && saved.path === document.file) return saved.file
  const { data, error } = await supabase.storage.from("documents").download(document.file)
  if (error) throw toServerError(error)
  await db.documentFiles.put({ id: document.id, path: document.file, file: data })
  return data
}

// Освобождает место на телефоне. Документ останется в списке, файл скачается при следующем открытии.
export async function forgetDocumentFile(id: string): Promise<void> {
  await db.documentFiles.delete(id)
}

// Файлы документов, которых больше нет в списке (удалены или заменены), только занимают место.
export async function dropStaleDocumentFiles(): Promise<void> {
  const [documents, saved] = await Promise.all([db.documents.toArray(), db.documentFiles.toArray()])
  const current = new Map(documents.map((item) => [item.id, item.file]))
  const stale = saved.filter((item) => current.get(item.id) !== item.path).map((item) => item.id)
  if (stale.length > 0) await db.documentFiles.bulkDelete(stale)
}
