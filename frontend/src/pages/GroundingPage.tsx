import { useState, type FormEvent } from "react"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { useLoad } from "../hooks/useLoad"
import { useCurrentUser } from "../lib/auth"
import { createMeasurement, deleteMeasurement, getGroundMeasurements, type Directories } from "../lib/data"
import { errorMessage, formatDateTime, nameById } from "../lib/format"
import type { GroundMeasurement } from "../types"

// Замеры сопротивления заземления. Норма по проекту: не более 4 Ом.
const DEFAULT_NORM = "4"
// Прибор обычно один и тот же: запоминаем последний на этом устройстве.
const INSTRUMENT_KEY = "electro:ground-instrument"

function readInstrument(): string {
  try {
    return localStorage.getItem(INSTRUMENT_KEY) ?? ""
  } catch {
    return ""
  }
}

// «2,5» и «2.5» одинаково: на русской клавиатуре телефона запятая.
function parseNumber(value: string): number {
  return Number(value.trim().replace(",", "."))
}

export default function GroundingPage() {
  const user = useCurrentUser()
  const { data, error, reload } = useLoad(getGroundMeasurements, [])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  async function handleExport() {
    if (!data) return
    setExporting(true)
    setExportError("")
    try {
      const { downloadGroundProtocol } = await import("../lib/groundExport")
      await downloadGroundProtocol(data.measurements, data.directories, data.object)
    } catch (exportFailure) {
      console.error("Выгрузка протокола", exportFailure)
      setExportError(errorMessage(exportFailure))
    } finally {
      setExporting(false)
    }
  }

  const measurements = data?.measurements ?? []
  const failing = measurements.filter((item) => Number(item.resistance) > Number(item.norm)).length

  return (
    <>
      <PageHeader title="Замеры заземления" subtitle={data?.object?.name} backTo="/" />
      <main className="page">
        {!data ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : !data.object ? (
          <p className="panel">Объект ещё не создан.</p>
        ) : (
          <>
            <MeasurementForm objectId={data.object.id} directories={data.directories} />

            <section className="space-y-3">
              <h2 className="pt-2 text-xl font-bold">
                Замеры <span className="font-semibold text-gray-700 tabular-nums">{measurements.length}</span>
              </h2>
              {failing > 0 && (
                <p role="alert" className="font-semibold text-red-800">
                  Выше нормы: {failing}
                </p>
              )}
              {measurements.length === 0 && <p className="text-gray-700">Замеров пока нет.</p>}
              {measurements.map((item) => (
                <MeasurementCard
                  key={item.id}
                  measurement={item}
                  directories={data.directories}
                  canDelete={Boolean(user?.is_admin)}
                />
              ))}
            </section>

            {measurements.length > 0 && (
              <section className="panel space-y-3">
                <h2 className="panel-title">Протокол</h2>
                <p className="text-base text-gray-700">Все замеры одной таблицей Excel: с датами, нормой и отметкой о соответствии.</p>
                {exportError && (
                  <p role="alert" className="font-semibold text-red-800">
                    {exportError}
                  </p>
                )}
                <button type="button" className="btn w-full" disabled={exporting} onClick={() => void handleExport()}>
                  {exporting ? "Готовим файл…" : "Скачать Excel"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}

// --- Новый замер ---

function MeasurementForm({ objectId, directories }: { objectId: string; directories: Directories }) {
  const [place, setPlace] = useState("")
  const [floor, setFloor] = useState("")
  const [room, setRoom] = useState("")
  const [resistance, setResistance] = useState("")
  const [norm, setNorm] = useState(DEFAULT_NORM)
  const [instrument, setInstrument] = useState(readInstrument)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = parseNumber(resistance)
    const limit = parseNumber(norm)
    const problem = !place.trim()
      ? "Укажите, что мерили."
      : !resistance.trim() || !Number.isFinite(value) || value < 0
        ? "Введите сопротивление числом, например 2,5."
        : !Number.isFinite(limit) || limit <= 0
          ? "Введите норму числом, например 4."
          : ""
    if (problem) {
      setMessage({ ok: false, text: problem })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await createMeasurement(objectId, {
        place: place.trim(),
        floor,
        room,
        resistance: value,
        norm: limit,
        instrument: instrument.trim(),
        comment: comment.trim(),
      })
      try {
        localStorage.setItem(INSTRUMENT_KEY, instrument.trim())
      } catch {
        // Без сохранения прибора просто придётся ввести его снова
      }
      setPlace("")
      setResistance("")
      setComment("")
      const shown = value.toLocaleString("ru-RU")
      setMessage({
        ok: value <= limit,
        text:
          value <= limit
            ? `Записано: ${shown} Ом, в норме.`
            : `Записано: ${shown} Ом. Это выше нормы ${limit.toLocaleString("ru-RU")} Ом.`,
      })
    } catch (saveError) {
      setMessage({ ok: false, text: errorMessage(saveError) })
    } finally {
      setSaving(false)
    }
  }

  const floorRooms = directories.rooms.filter((item) => item.floor === floor)

  return (
    <form onSubmit={handleSubmit} noValidate className="panel space-y-4">
      <h2 className="panel-title">Новый замер</h2>
      <label className="block">
        <span className="label">Что мерили</span>
        <input
          className="field"
          placeholder="Например, корпус ШТК"
          value={place}
          onChange={(event) => setPlace(event.target.value)}
        />
      </label>
      {/* items-end: подпись слева длиннее и переносится, поля всё равно стоят на одной линии. */}
      <div className="grid grid-cols-2 items-end gap-3">
        <label className="block min-w-0">
          <span className="label">Сопротивление, Ом</span>
          <input
            className="field"
            inputMode="decimal"
            value={resistance}
            onChange={(event) => setResistance(event.target.value)}
          />
        </label>
        <label className="block min-w-0">
          <span className="label">Норма, Ом</span>
          <input className="field" inputMode="decimal" value={norm} onChange={(event) => setNorm(event.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Этаж</span>
          <select
            className="field"
            value={floor}
            onChange={(event) => {
              setFloor(event.target.value)
              setRoom("")
            }}
          >
            <option value="">Не указан</option>
            {directories.floors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Помещение</span>
          <select className="field" value={room} disabled={!floor} onChange={(event) => setRoom(event.target.value)}>
            <option value="">{floor ? "Не указано" : "Сначала выберите этаж"}</option>
            {floorRooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Прибор</span>
        <input
          className="field"
          placeholder="Например, MRU-120"
          value={instrument}
          onChange={(event) => setInstrument(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="label">Комментарий</span>
        <textarea className="field py-3" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`font-semibold ${message.ok ? "text-green-800" : "text-red-800"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? "Сохраняем…" : "Сохранить замер"}
      </button>
    </form>
  )
}

// --- Один замер в списке ---

interface MeasurementCardProps {
  measurement: GroundMeasurement
  directories: Directories
  canDelete: boolean
}

function MeasurementCard({ measurement, directories, canDelete }: MeasurementCardProps) {
  const [error, setError] = useState("")
  const value = Number(measurement.resistance)
  const limit = Number(measurement.norm)
  const ok = value <= limit
  const where = [nameById(directories.floors, measurement.floor), nameById(directories.rooms, measurement.room)]
    .filter(Boolean)
    .join(" · ")

  async function handleDelete() {
    if (!window.confirm(`Удалить замер «${measurement.place}»? Отменить удаление нельзя.`)) return
    try {
      await deleteMeasurement(measurement)
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  return (
    <article className={`border-2 bg-white p-3 ${ok ? "border-gray-300" : "border-red-700"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="leading-snug font-semibold break-words">{measurement.place}</p>
          {where && <p className="text-base text-gray-800">{where}</p>}
        </div>
        <p className={`shrink-0 text-right ${ok ? "text-green-800" : "text-red-800"}`}>
          <span className="block text-2xl leading-tight font-bold tabular-nums">{value.toLocaleString("ru-RU")} Ом</span>
          <span className="block text-sm font-semibold">
            {ok ? "в норме" : "выше нормы"}, ≤ {limit.toLocaleString("ru-RU")}
          </span>
        </p>
      </div>
      <p className="mt-2 text-base text-gray-700">
        {formatDateTime(measurement.measured_at)}, {nameById(directories.users, measurement.measured_by) || "—"}
        {measurement.instrument && ` · ${measurement.instrument}`}
      </p>
      {measurement.comment && <p className="mt-1 text-base break-words whitespace-pre-line">{measurement.comment}</p>}
      {error && (
        <p role="alert" className="mt-2 font-semibold text-red-800">
          {error}
        </p>
      )}
      {canDelete && (
        <button type="button" className="btn btn-danger mt-3 w-full" onClick={() => void handleDelete()}>
          Удалить замер
        </button>
      )}
    </article>
  )
}
