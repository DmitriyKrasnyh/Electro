import type { TaskChanges } from "../lib/data"
import type { ChecklistItem } from "../types"
import { AddItemForm } from "./AddItemForm"
import { CheckIcon, CloseIcon } from "./icons"

interface ChecklistPanelProps {
  checklist: ChecklistItem[] | null
  disabled: boolean
  onSave: (changes: TaskChanges) => Promise<boolean>
}

export function ChecklistPanel({ checklist, disabled, onSave }: ChecklistPanelProps) {
  const items = checklist ?? []
  const doneCount = items.filter((item) => item.done).length

  function toggle(index: number) {
    const next = items.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
    void onSave({ checklist: next })
  }

  function remove(index: number) {
    void onSave({ checklist: items.filter((_, i) => i !== index) })
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        Чек-лист{items.length > 0 && `: ${doneCount} из ${items.length}`}
      </h2>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${index}-${item.text}`} className="flex gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              disabled={disabled}
              onClick={() => toggle(index)}
              className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 border-2 border-gray-400 bg-white px-3 py-2 text-left active:bg-gray-200 disabled:cursor-default disabled:opacity-50"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 ${
                  item.done ? "border-green-700 bg-green-700 text-white" : "border-gray-950 bg-white"
                }`}
              >
                {item.done && <CheckIcon />}
              </span>
              <span className={`min-w-0 leading-snug break-words ${item.done ? "line-through" : ""}`}>
                {item.text}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Удалить пункт: ${item.text}`}
              disabled={disabled}
              onClick={() => remove(index)}
              className="btn w-14 shrink-0 border-gray-400 px-0"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>
      <div className={items.length > 0 ? "mt-3" : ""}>
        <AddItemForm
          placeholder="Пункт"
          label="Новый пункт"
          disabled={disabled}
          onAdd={(text) => onSave({ checklist: [...items, { text, done: false }] })}
        />
      </div>
    </section>
  )
}
