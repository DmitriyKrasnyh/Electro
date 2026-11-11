import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { PlanViewer } from "../components/PlanViewer"
import { useLoad } from "../hooks/useLoad"
import { getDocument, getDocumentFile } from "../lib/documents"
import { NotFoundError, errorMessage } from "../lib/format"
import { openPdf, type OpenPdf } from "../lib/planImage"
import { ServerError } from "../lib/supabase"

// Просмотр PDF по страницам. Страница рисуется картинкой и листается и увеличивается
// так же, как план этажа. Номер страницы хранится в адресе: после «Назад» он сохраняется.
export default function DocumentPage() {
  const { id = "" } = useParams()
  const [params, setParams] = useSearchParams()
  const { data: document, error: loadError, reload } = useLoad(async () => {
    const found = await getDocument(id)
    if (!found) throw new NotFoundError()
    return found
  }, [id])

  const [file, setFile] = useState<Blob | null>(null)
  const [pdf, setPdf] = useState<OpenPdf | null>(null)
  const [imageUrl, setImageUrl] = useState("")
  const [problem, setProblem] = useState("")
  const [rendering, setRendering] = useState(false)
  const pages = pdf?.pages ?? 0
  const page = Math.min(Math.max(1, Number(params.get("page")) || 1), Math.max(1, pages))

  // 1. Файл: с устройства или скачиваем.
  useEffect(() => {
    if (!document) return
    let cancelled = false
    setProblem("")
    getDocumentFile(document)
      .then((blob) => !cancelled && setFile(blob))
      .catch((fileError) => {
        if (cancelled) return
        const offline = fileError instanceof ServerError && fileError.status === 0
        setProblem(offline ? "Документ ещё не скачан на это устройство. Нужна связь с сервером." : errorMessage(fileError))
      })
    return () => {
      cancelled = true
    }
  }, [document?.id, document?.file])

  // 2. Открываем PDF. Закрываем, когда уходим со страницы.
  useEffect(() => {
    if (!file) return
    let opened: OpenPdf | null = null
    let cancelled = false
    openPdf(file)
      .then((result) => {
        opened = result
        if (cancelled) void result.close()
        else setPdf(result)
      })
      .catch((openError) => {
        console.error("PDF не открылся", openError)
        if (!cancelled) setProblem("Не удалось открыть этот PDF.")
      })
    return () => {
      cancelled = true
      void opened?.close()
      setPdf(null)
    }
  }, [file])

  // 3. Рисуем нужную страницу. Пока рисуется, видна предыдущая.
  const latestUrl = useRef("")
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    setRendering(true)
    pdf
      .renderPage(page)
      .then((image) => {
        if (cancelled) return
        const url = URL.createObjectURL(image)
        if (latestUrl.current) URL.revokeObjectURL(latestUrl.current)
        latestUrl.current = url
        setImageUrl(url)
      })
      .catch((renderError) => {
        console.error("Страница не нарисовалась", renderError)
        if (!cancelled) setProblem("Не удалось показать эту страницу.")
      })
      .finally(() => !cancelled && setRendering(false))
    return () => {
      cancelled = true
    }
  }, [pdf, page])
  useEffect(() => () => URL.revokeObjectURL(latestUrl.current), [])

  function goTo(next: number) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.set("page", String(next))
        return updated
      },
      { replace: true },
    )
  }

  // Сохранить файл на телефон, например чтобы открыть его в другой программе.
  function saveFile() {
    if (!file || !document) return
    const url = URL.createObjectURL(file)
    const link = window.document.createElement("a")
    link.href = url
    link.download = `${document.title}.pdf`
    window.document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader title={document?.title ?? "Документ"} backTo="/documents" />

      <main className="relative min-h-0 flex-1 bg-gray-300">
        {imageUrl && !problem ? (
          <PlanViewer
            key={imageUrl}
            imageUrl={imageUrl}
            markers={[]}
            selectedId={null}
            draft={null}
            focus={null}
            onTapPlan={() => {}}
          />
        ) : (
          <div className="p-3">
            {!document ? (
              <LoadStatus error={loadError} onRetry={reload} />
            ) : problem ? (
              <p role="alert" className="panel font-semibold text-red-800">
                {problem}
              </p>
            ) : (
              <p className="panel">{file ? "Открываем документ…" : "Загружаем документ на устройство…"}</p>
            )}
          </div>
        )}
      </main>

      {pages > 0 && !problem && (
        <div className="border-t-2 border-gray-950 bg-white p-2">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                className="btn w-16 shrink-0 px-0 text-2xl"
                aria-label="Предыдущая страница"
                disabled={page <= 1}
                onClick={() => goTo(page - 1)}
              >
                ‹
              </button>
              <select
                className="field min-w-0 flex-1 text-center"
                aria-label="Страница"
                value={page}
                onChange={(event) => goTo(Number(event.target.value))}
              >
                {Array.from({ length: pages }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    Страница {index + 1} из {pages}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn w-16 shrink-0 px-0 text-2xl"
                aria-label="Следующая страница"
                disabled={page >= pages}
                onClick={() => goTo(page + 1)}
              >
                ›
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base text-gray-700" aria-live="polite">
                {rendering ? "Рисуем страницу…" : ""}
              </span>
              <button type="button" className="btn shrink-0 px-3 text-base" onClick={saveFile}>
                Сохранить файл
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
