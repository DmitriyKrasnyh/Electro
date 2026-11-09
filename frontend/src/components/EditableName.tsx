import { useState, type FormEvent, type ReactNode } from "react"
import { PencilIcon } from "./icons"

interface EditableNameProps {
  name: string
  disabled: boolean
  // Стиль названия: у этажа оно крупнее, чем у помещения.
  textClassName?: string
  // Возвращает true при успехе. При ошибке форма остаётся открытой.
  onSave: (name: string) => Promise<boolean>
  // Дополнительные кнопки перед карандашом, например «на плане» у помещения.
  actions?: ReactNode
}

// Название с кнопкой-карандашом, которая превращает его в поле ввода.
export function EditableName({ name, disabled, textClassName = "", onSave, actions }: EditableNameProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  function startEditing() {
    setValue(name)
    setEditing(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = value.trim()
    if (!text) return
    const saved = text === name || (await onSave(text))
    if (saved) setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-2 py-1">
        <input
          className="field"
          aria-label={`Новое название: ${name}`}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary min-w-0 flex-1 px-2" disabled={disabled || !value.trim()}>
            Сохранить
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-1">
      <span className={`min-w-0 flex-1 leading-snug break-words ${textClassName}`}>{name}</span>
      {actions}
      <button
        type="button"
        className="btn w-14 shrink-0 border-gray-400 px-0"
        aria-label={`Переименовать: ${name}`}
        onClick={startEditing}
      >
        <PencilIcon />
      </button>
    </div>
  )
}
