import { Link } from "react-router"
import { hasPlanPoint } from "../lib/format"
import type { Floor, Task } from "../types"

// Точка задачи на плане этажа. Если у этажа нет плана, панели нет.
export function PlanPointPanel({ task, floor }: { task: Task; floor: Floor | undefined }) {
  if (!floor?.plan) return null
  const planUrl = `/floors/${floor.id}/plan`

  return (
    <section className="panel">
      <h2 className="panel-title">Точка на плане</h2>
      {hasPlanPoint(task) ? (
        <div className="grid grid-cols-2 gap-2">
          <Link to={`${planUrl}?task=${task.id}`} className="btn px-2">
            Показать
          </Link>
          <Link to={`${planUrl}?place=${task.id}`} className="btn px-2">
            Переставить
          </Link>
        </div>
      ) : (
        <Link to={`${planUrl}?place=${task.id}`} className="btn w-full">
          Поставить точку
        </Link>
      )}
    </section>
  )
}
