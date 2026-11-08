import { useEffect } from "react"
import type { PhotoWithUrls } from "../lib/data"
import { formatDateTime, nameById } from "../lib/format"
import { PHOTO_TYPE_LABELS, type User } from "../types"
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "./icons"

interface PhotoViewerProps {
  photos: PhotoWithUrls[]
  index: number
  users: User[]
  onClose: () => void
  onSelect: (photoId: string) => void
}

// Полноэкранный просмотр. Листает по кругу: после последнего фото снова первое.
export function PhotoViewer({ photos, index, users, onClose, onSelect }: PhotoViewerProps) {
  const photo = photos[index]

  function show(step: number) {
    onSelect(photos[(index + step + photos.length) % photos.length].id)
  }

  // Пока открыт просмотр, страница под ним не прокручивается.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  // Клавиатура для ноутбука: Esc закрывает, стрелки листают.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
      if (event.key === "ArrowLeft") show(-1)
      if (event.key === "ArrowRight") show(1)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      className="fixed inset-0 z-20 flex flex-col bg-gray-950 text-white"
    >
      <div className="flex min-h-18 items-center justify-between gap-2 px-2 py-2">
        <p className="min-w-0 px-1 leading-tight">
          <span className="block font-bold">{PHOTO_TYPE_LABELS[photo.type]}</span>
          <span className="block text-base text-gray-300 tabular-nums">
            {index + 1} из {photos.length}
          </span>
        </p>
        <button type="button" className="btn btn-header w-14 shrink-0 px-0" aria-label="Закрыть" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {/* key: при листании старое фото сразу исчезает, а не висит, пока грузится новое. */}
      <div className="min-h-0 flex-1">
        <img
          key={photo.id}
          src={photo.fullUrl}
          crossOrigin="anonymous"
          alt={`${PHOTO_TYPE_LABELS[photo.type]}. ${photo.comment}`}
          className="h-full w-full object-contain"
        />
      </div>

      <div className="max-h-32 overflow-y-auto px-3 py-2 text-base leading-snug">
        <p className="text-gray-300">
          {formatDateTime(photo.taken_at)} · {nameById(users, photo.author)}
          {photo.pending && " · ждёт отправки"}
        </p>
        {photo.comment && <p className="break-words whitespace-pre-line">{photo.comment}</p>}
      </div>

      {photos.length > 1 && (
        <div className="grid grid-cols-2 gap-2 p-2">
          <button type="button" className="btn btn-header" aria-label="Предыдущее фото" onClick={() => show(-1)}>
            <ArrowLeftIcon />
          </button>
          <button type="button" className="btn btn-header" aria-label="Следующее фото" onClick={() => show(1)}>
            <ArrowRightIcon />
          </button>
        </div>
      )}
    </div>
  )
}
