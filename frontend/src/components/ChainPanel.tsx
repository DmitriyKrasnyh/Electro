import { useState } from "react"
import { Link } from "react-router"
import type { TaskChanges } from "../lib/data"
import { chainCandidates } from "../lib/data"
import { SYSTEM_LABELS, TASK_SYSTEMS, type Task } from "../types"
import { StatusBadge } from "./taskBits"

interface ChainPanelProps {
  task: Task
  tasks: Task[] // все задачи объекта
  disabled: boolean
  onSave: (changes: TaskChanges) => Promise<boolean>
}

// Цепочка работ: что нужно сдать до этой задачи и что ждёт её саму.
// Пример: проложить кабель → смонтировать камеру → настроить.
export function ChainPanel({ task, tasks, disabled, onSave }: ChainPanelProps) {
  const [choosing, setChoosing] = useState(false)
  const [choice, setChoice] = useState("")
  const previous = tasks.find((other) => other.id === task.depends_on)
  const next = tasks.filter((other) => other.depends_on === task.id)

  async function save(dependsOn: string) {
    if (await onSave({ depends_on: dependsOn })) setChoosing(false)
  }

  // В списке выбора задачи сгруппированы по системам: так нужную найти быстрее.
  const candidates = chainCandidates(task, tasks)
  const nextUrl = `/tasks/new?${new URLSearchParams({ after: task.id, system: task.system, floor: task.floor, room: task.room })}`

  return (
    <section className="panel space-y-3">
      <h2 className="panel-title">Цепочка работ</h2>

      <div className="space-y-2">
        <p className="text-base font-semibold text-gray-700">Сначала нужно сделать</p>
        {choosing ? (
          <div className="space-y-2">
            <select
              className="field"
              aria-label="Предыдущая задача"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Ничего, можно начинать сразу</option>
              {TASK_SYSTEMS.map((system) => {
                const ofSystem = candidates.filter((other) => other.system === system)
                if (ofSystem.length === 0) return null
                return (
                  <optgroup key={system} label={SYSTEM_LABELS[system]}>
                    {ofSystem.map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.title}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setChoosing(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-primary min-w-0 flex-1 px-2"
                disabled={disabled}
                onClick={() => void save(choice)}
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <>
            {previous ? (
              <ChainLink task={previous} />
            ) : (
              <p className="text-base text-gray-800">Ничего, задачу можно начинать сразу.</p>
            )}
            {previous && (
              <p className={`font-semibold ${previous.status === "done" ? "text-green-800" : "text-amber-800"}`}>
                {previous.status === "done" ? "Предыдущая задача сдана, можно начинать." : "Ждёт: предыдущая задача ещё не сдана."}
              </p>
            )}
            <button
              type="button"
              className="btn w-full"
              disabled={disabled}
              onClick={() => {
                setChoice(task.depends_on)
                setChoosing(true)
              }}
            >
              {previous ? "Изменить" : "Указать предыдущую задачу"}
            </button>
          </>
        )}
      </div>

      <div className="space-y-2 border-t-2 border-gray-200 pt-3">
        <p className="text-base font-semibold text-gray-700">После неё</p>
        {next.length === 0 && <p className="text-base text-gray-800">Задач, которые её ждут, нет.</p>}
        {next.map((other) => (
          <ChainLink key={other.id} task={other} />
        ))}
        <Link to={nextUrl} className="btn w-full">
          Создать следующую задачу
        </Link>
      </div>
    </section>
  )
}

function ChainLink({ task }: { task: Task }) {
  return (
    <Link to={`/tasks/${task.id}`} className="block border-2 border-gray-300 p-3 active:bg-gray-100">
      <span className="block leading-snug font-semibold break-words">{task.title}</span>
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} />
        <span className="text-base text-gray-800">{SYSTEM_LABELS[task.system]}</span>
      </span>
    </Link>
  )
}
