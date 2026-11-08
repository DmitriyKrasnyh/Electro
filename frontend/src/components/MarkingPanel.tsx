import { useState, type FormEvent } from "react"
import type { TaskChanges } from "../lib/data"
import { MarkingTag } from "./taskBits"

interface MarkingPanelProps {
  marking: string
  disabled: boolean
  onSave: (changes: TaskChanges) => Promise<boolean>
}

export function MarkingPanel({ marking, disabled, onSave }: MarkingPanelProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  function startEditing() {
    setValue(marking)
    setEditing(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const saved = await onSave({ marking: value.trim() })
    if (saved) setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="panel space-y-3">
        <label className="block">
          <span className="panel-title block">Маркировка</span>
          <input
            className="field font-mono font-bold"
            placeholder="ЩР-2.3 гр.5"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary min-w-0 flex-1 px-2" disabled={disabled}>
            Сохранить
          </button>
        </div>
      </form>
    )
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Маркировка</h2>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {marking ? <MarkingTag marking={marking} /> : <p className="text-gray-700">Не указана</p>}
        </div>
        <button type="button" className="btn shrink-0" onClick={startEditing}>
          {marking ? "Изменить" : "Добавить"}
        </button>
      </div>
    </section>
  )
}
