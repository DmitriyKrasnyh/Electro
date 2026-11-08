import { useState, type FormEvent } from "react"

interface AddItemFormProps {
  // Подсказка в пустом поле. Держим её короткой: рядом кнопка, и места на телефоне мало.
  placeholder: string
  // Полное название поля для программ чтения с экрана.
  label: string
  disabled: boolean
  // Возвращает true при успехе. При ошибке текст остаётся в поле, чтобы не вводить его заново.
  onAdd: (text: string) => Promise<boolean>
}

// Поле с кнопкой «Добавить»: для пунктов чек-листа, этажей и помещений.
export function AddItemForm({ placeholder, label, disabled, onAdd }: AddItemFormProps) {
  const [value, setValue] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = value.trim()
    if (!text) return
    const saved = await onAdd(text)
    if (saved) setValue("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="field min-w-0 flex-1"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="btn shrink-0 px-3" disabled={disabled || !value.trim()}>
        Добавить
      </button>
    </form>
  )
}
