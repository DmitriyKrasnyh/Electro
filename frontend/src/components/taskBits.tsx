import { STATUS_STYLES } from "../lib/format"
import { STATUS_LABELS, type TaskStatus } from "../types"
import { LockIcon } from "./icons"

// Мелкие элементы, которые повторяются на разных экранах.

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block px-2 py-1 text-base leading-tight font-semibold ${STATUS_STYLES[status].badge}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// Маркировка выглядит как бирка на кабеле: моноширинный шрифт и чёрная рамка.
export function MarkingTag({ marking }: { marking: string }) {
  return (
    <span className="inline-block border-2 border-gray-950 bg-white px-2 py-0.5 font-mono text-base leading-tight font-bold break-words">
      {marking}
    </span>
  )
}

export function BlockedNote({ reason }: { reason: string }) {
  return (
    <p className="flex gap-2 leading-snug font-semibold text-red-800">
      <LockIcon />
      <span className="min-w-0 break-words">Заблокировано{reason ? `: ${reason}` : ""}</span>
    </p>
  )
}
