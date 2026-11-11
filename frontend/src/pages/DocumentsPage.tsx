import { useState, type ChangeEvent, type FormEvent } from "react"
import { Link } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { useLoad } from "../hooks/useLoad"
import { useCurrentUser } from "../lib/auth"
import { checkDocumentFile, deleteDocument, forgetDocumentFile, getDocuments, uploadDocument } from "../lib/documents"
import { errorMessage } from "../lib/format"
import type { ProjectDocument } from "../types"

// Документы объекта: проект, альбомы, схемы в PDF. Читают все, добавляет и удаляет администратор.
export default function DocumentsPage() {
  const user = useCurrentUser()
  const { data: documents, error, reload } = useLoad(getDocuments, [])
  const isAdmin = Boolean(user?.is_admin)
  const onDevice = (documents ?? []).filter((item) => item.onDevice)

  return (
    <>
      <PageHeader title="Документы" backTo="/" />
      <main className="page">
        {!documents ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            {documents.length === 0 && (
              <p className="panel">
                {isAdmin ? "Документов пока нет. Добавьте первый ниже." : "Документов пока нет. Их добавляет администратор."}
              </p>
            )}
            {documents.map((item) => (
              <DocumentCard key={item.id} document={item} onDevice={item.onDevice} isAdmin={isAdmin} />
            ))}
            {onDevice.length > 0 && (
              <p className="text-base text-gray-700">
                На этом устройстве: {onDevice.length} из {documents.length}, {formatSize(sum(onDevice))}. Они открываются и
                без связи.
              </p>
            )}
            {isAdmin && <UploadForm />}
          </>
        )}
      </main>
    </>
  )
}

// --- Документ в списке ---

function DocumentCard({ document, onDevice, isAdmin }: { document: ProjectDocument; onDevice: boolean; isAdmin: boolean }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`Удалить документ «${document.title}» у всей бригады? Отменить нельзя.`)) return
    setBusy(true)
    setError("")
    try {
      await deleteDocument(document)
    } catch (deleteError) {
      setError(errorMessage(deleteError))
      setBusy(false)
    }
  }

  return (
    <article className="border-2 border-gray-300 bg-white">
      <Link to={`/documents/${document.id}`} className="block p-3 active:bg-gray-100">
        <span className="block text-lg leading-snug font-semibold break-words">{document.title}</span>
        <span className="block text-base text-gray-800">
          PDF, {formatSize(document.size)} · {onDevice ? "есть на устройстве" : "скачается при открытии"}
        </span>
      </Link>
      {(onDevice || isAdmin) && (
        <div className="flex flex-wrap gap-2 border-t-2 border-gray-200 p-3">
          {onDevice && (
            <button type="button" className="btn min-w-0 flex-1 px-2 text-base" onClick={() => void forgetDocumentFile(document.id)}>
              Убрать с устройства
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-danger min-w-0 flex-1 px-2 text-base"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              {busy ? "Удаляем…" : "Удалить"}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="px-3 pb-3 font-semibold text-red-800">
          {error}
        </p>
      )}
    </article>
  )
}

// --- Загрузка нового документа (только администратор) ---

function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null
    setFile(picked)
    setMessage(null)
    // Название по умолчанию из имени файла, без «.pdf».
    if (picked && !title.trim()) setTitle(picked.name.replace(/\.pdf$/i, ""))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) return setMessage({ ok: false, text: "Выберите файл PDF." })
    if (!title.trim()) return setMessage({ ok: false, text: "Введите название документа." })
    const problem = await checkDocumentFile(file)
    if (problem) return setMessage({ ok: false, text: problem })

    setUploading(true)
    setMessage(null)
    try {
      await uploadDocument(file, title.trim())
      setFile(null)
      setTitle("")
      setMessage({ ok: true, text: "Документ добавлен. Бригада увидит его после синхронизации." })
    } catch (uploadError) {
      setMessage({ ok: false, text: errorMessage(uploadError) })
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="panel space-y-4">
      <h2 className="panel-title">Добавить документ</h2>
      <p className="text-base text-gray-700">PDF до 50 МБ. Нужна связь с сервером.</p>
      <label className="btn w-full">
        {file ? `Файл: ${file.name}` : "Выбрать PDF"}
        <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handlePick} />
      </label>
      {file && <p className="text-base text-gray-800">Размер: {formatSize(file.size)}</p>}
      <label className="block">
        <span className="label">Название</span>
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`font-semibold ${message.ok ? "text-green-800" : "text-red-800"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={uploading}>
        {uploading ? "Загружаем…" : "Загрузить"}
      </button>
    </form>
  )
}

function sum(items: { size: number }[]): number {
  return items.reduce((total, item) => total + Number(item.size), 0)
}

export function formatSize(bytes: number): string {
  const megabytes = Number(bytes) / (1024 * 1024)
  return megabytes >= 1
    ? `${megabytes.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`
    : `${Math.max(1, Math.round(Number(bytes) / 1024))} КБ`
}
