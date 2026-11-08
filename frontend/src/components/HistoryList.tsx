import { formatDateTime, nameById } from "../lib/format"
import { HISTORY_FIELD_LABELS, type Task, type TaskHistory, type User } from "../types"

interface HistoryListProps {
  task: Task
  history: TaskHistory[]
  users: User[]
}

export function HistoryList({ task, history, users }: HistoryListProps) {
  // Настоящее время создания хранит отдельная строка истории. У задач из тестовых данных
  // её нет, тогда берём время из самой задачи.
  const createdAt = history.find((row) => row.field === "created")?.changed_at ?? task.created
  const rows = history.filter((row) => row.field !== "created")

  return (
    <section className="panel">
      <h2 className="panel-title">История изменений</h2>
      <ol className="divide-y-2 divide-gray-200">
        {rows.map((row) => (
          <li key={row.id} className="py-2 first:pt-0">
            <p className="text-base text-gray-700">
              {formatDateTime(row.changed_at || row.created)} · {nameById(users, row.user)}
            </p>
            <p className="leading-snug break-words">
              <span className="font-semibold">{HISTORY_FIELD_LABELS[row.field] ?? row.field}:</span>{" "}
              {row.old_value || "—"} → {row.new_value || "—"}
            </p>
          </li>
        ))}
        <li className="py-2 first:pt-0">
          <p className="text-base text-gray-700">
            {formatDateTime(createdAt)}
            {task.created_by && ` · ${nameById(users, task.created_by)}`}
          </p>
          <p className="font-semibold">Задача создана</p>
        </li>
      </ol>
    </section>
  )
}
