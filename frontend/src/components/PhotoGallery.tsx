import { useState, type ChangeEvent } from "react"
import { useSearchParams } from "react-router"
import { useGoBack } from "../hooks/useGoBack"
import { createPhoto, type PhotoWithUrls } from "../lib/data"
import { formatDateTime } from "../lib/format"
import { PHOTO_TYPE_LABELS, type PhotoType, type User } from "../types"
import { CameraIcon, ImageIcon } from "./icons"
import { PhotoAddForm } from "./PhotoAddForm"
import { PhotoViewer } from "./PhotoViewer"

interface PhotoGalleryProps {
  taskId: string
  photos: PhotoWithUrls[]
  users: User[]
}

export function PhotoGallery({ taskId, photos, users }: PhotoGalleryProps) {
  const [pickedFile, setPickedFile] = useState<File | null>(null)

  // Открытое фото хранится в адресе страницы: системная кнопка «Назад» на Android
  // закроет просмотр, а не уведёт из карточки задачи.
  const [params, setParams] = useSearchParams()
  const closeViewer = useGoBack(`/tasks/${taskId}`)
  const openIndex = photos.findIndex((photo) => photo.id === params.get("photo"))

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // иначе повторный выбор того же файла не сработает
    if (file) setPickedFile(file)
  }

  async function handleSave(compressed: File, type: PhotoType, comment: string) {
    if (!pickedFile) return
    // Время съёмки берём из исходного файла: фото из галереи могло быть снято раньше.
    const takenAt = new Date(pickedFile.lastModified || Date.now())
    await createPhoto(taskId, compressed, type, comment, takenAt)
    setPickedFile(null)
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Фото{photos.length > 0 && `: ${photos.length}`}</h2>

      {pickedFile ? (
        <PhotoAddForm file={pickedFile} onCancel={() => setPickedFile(null)} onSubmit={handleSave} />
      ) : (
        <>
          {/* Подпись к скрытому полю работает как кнопка выбора файла. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="btn btn-primary px-2">
              <CameraIcon />
              Снять
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePick}
              />
            </label>
            <label className="btn px-2">
              <ImageIcon />
              Галерея
              <input type="file" accept="image/*" className="sr-only" onChange={handlePick} />
            </label>
          </div>

          {photos.length === 0 ? (
            <p className="mt-3 text-gray-700">Фото пока нет.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setParams({ photo: photo.id })}
                  className="block cursor-pointer border-2 border-gray-300 text-left active:border-gray-950"
                >
                  {/* crossOrigin нужен, чтобы service worker мог сохранить снимок в кэш. */}
                  <img
                    src={photo.thumbUrl}
                    crossOrigin="anonymous"
                    alt={`${PHOTO_TYPE_LABELS[photo.type]}. ${photo.comment}`}
                    loading="lazy"
                    className="aspect-square w-full bg-gray-200 object-cover text-sm"
                  />
                  <span className="block px-2 pt-1 text-base leading-tight font-semibold">
                    {PHOTO_TYPE_LABELS[photo.type]}
                  </span>
                  <span className="block px-2 pb-1 text-sm leading-tight text-gray-700">
                    {formatDateTime(photo.taken_at)}
                    {photo.pending && <span className="block font-semibold text-gray-950">Ждёт отправки</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {openIndex !== -1 && (
        <PhotoViewer
          photos={photos}
          index={openIndex}
          users={users}
          onClose={closeViewer}
          // replace: «Назад» закрывает просмотр сразу, а не перебирает все пролистанные фото.
          onSelect={(photoId) => setParams({ photo: photoId }, { replace: true })}
        />
      )}
    </section>
  )
}
