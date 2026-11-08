import { useState, type FormEvent } from "react"
import type { TaskChanges } from "../lib/data"
import type { Task } from "../types"
import { BlockedNote } from "./taskBits"

interface BlockPanelProps {
  task: Task
  disabled: boolean
  onSave: (changes: TaskChanges) => Promise<boolean>
}

export function BlockPanel({ task, disabled, onSave }: BlockPanelProps) {
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonMissing, setReasonMissing] = useState(false)

  function closeForm() {
    setEditing(false)
    setReason("")
    setReasonMissing(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = reason.trim()
    // Причина обязательна: коллеги должны понимать, чего ждёт задача.
    if (!text) {
      setReasonMissing(true)
      return
    }
    const saved = await onSave({ blocked: true, blocked_reason: text })
    if (saved) closeForm()
  }

  if (task.blocked) {
    return (
      <section className="border-2 border-red-700 bg-white">
        <div className="hazard h-3" />
        <div className="space-y-3 p-4">
          <BlockedNote reason={task.blocked_reason} />
          <button
            type="button"
            className="btn w-full"
            disabled={disabled}
            onClick={() => onSave({ blocked: false, blocked_reason: "" })}
          >
            Снять блокировку
          </button>
        </div>
      </section>
    )
  }

  if (!editing) {
    return (
      <button type="button" className="btn btn-danger w-full" onClick={() => setEditing(true)}>
        Заблокировать
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 border-2 border-red-700 bg-white p-4">
      <label className="block">
        <span className="label">Причина блокировки</span>
        <textarea
          className="field py-3"
          rows={2}
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {reasonMissing && (
        <p role="alert" className="font-semibold text-red-800">
          Укажите причину.
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={closeForm}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary min-w-0 flex-1 px-2" disabled={disabled}>
          Заблокировать
        </button>
      </div>
    </form>
  )
}
