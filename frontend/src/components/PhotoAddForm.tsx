import { useEffect, useState, type FormEvent } from "react"
import { compressPhoto } from "../lib/compressPhoto"
import { errorMessage } from "../lib/format"
import { PHOTO_TYPES, PHOTO_TYPE_LABELS, type PhotoType } from "../types"

interface PhotoAddFormProps {
  file: File
  onCancel: () => void
  onSubmit: (compressed: File, type: PhotoType, comment: string) => Promise<void>
}

type Step = "idle" | "compressing" | "saving"

// Шаги добавления фото: выбор типа, комментарий, сжатие, сохранение на устройстве.
// На сервер фото отправится само, как только появится связь.
export function PhotoAddForm({ file, onCancel, onSubmit }: PhotoAddFormProps) {
  const [previewUrl, setPreviewUrl] = useState("")
  const [type, setType] = useState<PhotoType | "">("")
  const [comment, setComment] = useState("")
  const [step, setStep] = useState<Step>("idle")
  const [error, setError] = useState("")

  // Временный адрес для предпросмотра. Освобождаем его, чтобы не занимать память телефона.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!type) {
      setError("Выберите тип фото.")
      return
    }
    setError("")

    let compressed: File
    try {
      setStep("compressing")
      compressed = await compressPhoto(file)
    } catch {
      setError("Не удалось обработать этот файл. Выберите другое фото.")
      setStep("idle")
      return
    }

    try {
      setStep("saving")
      await onSubmit(compressed, type, comment.trim())
    } catch (saveError) {
      setError(`Не сохранено. ${errorMessage(saveError)}`)
      setStep("idle")
    }
  }

  const busy = step !== "idle"

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {previewUrl && (
        <img src={previewUrl} alt="Выбранное фото" className="max-h-64 w-full bg-gray-200 object-contain" />
      )}

      <fieldset disabled={busy} className="space-y-4">
        <div>
          <p className="label">Тип фото</p>
          <div className="grid grid-cols-2 gap-2">
            {PHOTO_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === type}
                onClick={() => setType(value)}
                className={`btn px-2 ${value === type ? "btn-primary" : "border-gray-400 font-medium"}`}
              >
                {PHOTO_TYPE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="label">Комментарий</span>
          <textarea
            className="field py-3"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary min-w-0 flex-1 px-2" disabled={busy}>
          {step === "compressing" && "Сжимаем…"}
          {step === "saving" && "Сохраняем…"}
          {step === "idle" && "Сохранить фото"}
        </button>
      </div>
    </form>
  )
}
