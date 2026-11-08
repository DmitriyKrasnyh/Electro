import { useState, type ChangeEvent } from "react"
import { Link } from "react-router"
import { checkPlanFile, uploadFloorPlan, PLAN_FILE_TYPES } from "../lib/data"
import { PLAN_ON_DEVICE } from "../lib/db"
import { errorMessage } from "../lib/format"
import type { Floor } from "../types"

// Загрузка плана в справочнике этажей.
export function FloorPlanControls({ floor }: { floor: Floor }) {
  const [error, setError] = useState("")

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // иначе повторный выбор того же файла не сработает
    if (!file) return
    setError("")

    const problem = await checkPlanFile(file)
    if (problem) {
      setError(problem)
      return
    }
    // Точки задач привязаны к листу в процентах. На другом чертеже они могут оказаться не на месте.
    if (floor.plan && !window.confirm("Заменить план? Точки задач останутся там же относительно листа.")) return

    try {
      await uploadFloorPlan(floor, file)
    } catch (saveError) {
      setError(`Не сохранено. ${errorMessage(saveError)}`)
    }
  }

  const input = (
    <input
      type="file"
      accept={Object.keys(PLAN_FILE_TYPES).join(",")}
      aria-label={`Файл плана: ${floor.name}`}
      className="sr-only"
      onChange={(event) => void handlePick(event)}
    />
  )

  return (
    <div className="mt-2 space-y-2">
      {floor.plan ? (
        <div className="grid grid-cols-2 gap-2">
          <Link to={`/floors/${floor.id}/plan`} className="btn px-2">
            Открыть план
          </Link>
          <label className="btn px-2">
            Заменить план
            {input}
          </label>
        </div>
      ) : (
        <label className="btn w-full">
          Загрузить план
          {input}
        </label>
      )}
      {floor.plan === PLAN_ON_DEVICE && <p className="text-base font-semibold">План ждёт отправки</p>}
      {error && (
        <p role="alert" className="font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}
