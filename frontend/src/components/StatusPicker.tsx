import { STATUS_STYLES } from "../lib/format"
import { STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "../types"
import { CheckIcon } from "./icons"

interface StatusPickerProps {
  status: TaskStatus
  disabled: boolean
  onChange: (status: TaskStatus) => void
}

// Любой статус ставится одним нажатием, поэтому ошибочное нажатие так же легко исправить.
export function StatusPicker({ status, disabled, onChange }: StatusPickerProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Статус</h2>
      {/* На телефоне в один столбец: длинные названия помещаются, и труднее промахнуться в перчатках. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {TASK_STATUSES.map((value) => {
          const active = value === status
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              // Текущий статус не гасим при сохранении, он должен оставаться заметным.
              disabled={disabled && !active}
              onClick={() => {
                if (!active) onChange(value)
              }}
              className={`btn justify-start px-3 ${
                active ? `${STATUS_STYLES[value].badge} border-gray-950` : "border-gray-400 font-medium"
              }`}
            >
              {active ? <CheckIcon /> : <span className={`h-5 w-5 shrink-0 ${STATUS_STYLES[value].bar}`} />}
              {STATUS_LABELS[value]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
