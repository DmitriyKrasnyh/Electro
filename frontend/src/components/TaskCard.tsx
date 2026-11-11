import { Link } from "react-router"
import type { Directories } from "../lib/data"
import { STATUS_STYLES, formatDate, isOverdue, nameById } from "../lib/format"
import { SYSTEM_LABELS, type Task } from "../types"
import { BlockedNote, MarkingTag, StatusBadge } from "./taskBits"

interface TaskCardProps {
  task: Task
  directories: Directories
  // На главной задачи разных систем идут вперемешку, поэтому там показываем систему.
  showSystem?: boolean
  // Несданная предыдущая задача из цепочки: пока она не сдана, эта ждёт.
  waitingOn?: Task | null
}

// Задача в списке. Цвет статуса виден полосой слева, блокировка красной рамкой и лентой.
export function TaskCard({ task, directories, showSystem = false, waitingOn = null }: TaskCardProps) {
  const place = [
    showSystem ? SYSTEM_LABELS[task.system] : "",
    nameById(directories.floors, task.floor),
    nameById(directories.rooms, task.room),
  ]
    .filter(Boolean)
    .join(" · ")
  const assignee = nameById(directories.users, task.assignee)
  const overdue = isOverdue(task)

  return (
    <Link
      to={`/tasks/${task.id}`}
      className={`block border-2 bg-white active:bg-gray-100 ${task.blocked ? "border-red-700" : "border-gray-300"}`}
    >
      {task.blocked && <div className="hazard h-2.5" />}
      <div className="flex">
        <div className={`w-3 shrink-0 ${STATUS_STYLES[task.status].bar}`} />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="leading-snug font-semibold break-words">{task.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            {task.priority === "high" && (
              <span className="bg-gray-950 px-2 py-1 text-base leading-tight font-semibold text-white">
                Высокий приоритет
              </span>
            )}
            {task.marking && <MarkingTag marking={task.marking} />}
          </div>
          <p className="text-base leading-snug text-gray-800">{place}</p>
          {(assignee || task.due_date) && (
            <p className="text-base leading-snug text-gray-800">
              {assignee || "Исполнитель не назначен"}
              {task.due_date && (
                <span className={overdue ? "font-bold text-red-800" : ""}>
                  {" · "}до {formatDate(task.due_date)}
                  {overdue && ", просрочено"}
                </span>
              )}
            </p>
          )}
          {task.blocked && <BlockedNote reason={task.blocked_reason} />}
          {waitingOn && (
            <p className="leading-snug font-semibold break-words text-amber-800">Ждёт: {waitingOn.title}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
