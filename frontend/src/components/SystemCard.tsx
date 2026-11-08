import { Link } from "react-router"
import { SYSTEM_LABELS, type Task, type TaskSystem } from "../types"

interface SystemCardProps {
  system: TaskSystem
  tasks: Task[] // задачи только этой системы
}

export function SystemCard({ system, tasks }: SystemCardProps) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === "done").length
  const blocked = tasks.filter((task) => task.blocked).length
  const percentDone = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Link to={`/systems/${system}`} className="block border-2 border-gray-950 bg-white active:bg-gray-200">
      <h2 className="px-3 pt-3 text-xl leading-tight font-bold">{SYSTEM_LABELS[system]}</h2>
      <dl className="flex gap-6 px-3 pt-2 pb-3">
        <Counter label="всего" value={total} />
        <Counter label="сделано" value={done} />
        <Counter label="заблокировано" value={blocked} alert={blocked > 0} />
      </dl>
      <div className="h-2.5 bg-gray-200">
        <div className="h-full bg-green-700" style={{ width: `${percentDone}%` }} />
      </div>
    </Link>
  )
}

function Counter({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={alert ? "text-red-800" : ""}>
      <dd className="text-2xl leading-tight font-bold tabular-nums">{value}</dd>
      <dt className={`text-sm ${alert ? "font-semibold" : "text-gray-700"}`}>{label}</dt>
    </div>
  )
}
