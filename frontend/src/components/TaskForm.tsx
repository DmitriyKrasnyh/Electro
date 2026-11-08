import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import type { Directories, TaskFields } from "../lib/data"
import { dateToDb, errorMessage } from "../lib/format"
import {
  PRIORITY_LABELS,
  SYSTEM_LABELS,
  TASK_PRIORITIES,
  TASK_SYSTEMS,
  type Task,
  type TaskPriority,
  type TaskSystem,
} from "../types"
import { ChevronDownIcon } from "./icons"

// Значения полей формы. Срок здесь в формате <input type="date">: "2026-11-10".
export interface TaskFormValues {
  system: TaskSystem | ""
  floor: string
  title: string
  room: string
  assignee: string
  marking: string
  priority: TaskPriority
  due_date: string
  description: string
}

export function emptyFormValues(system: TaskSystem | "", floor: string): TaskFormValues {
  return {
    system,
    floor,
    title: "",
    room: "",
    assignee: "",
    marking: "",
    priority: "normal",
    due_date: "",
    description: "",
  }
}

export function formValuesFromTask(task: Task): TaskFormValues {
  return {
    system: task.system,
    floor: task.floor,
    title: task.title,
    room: task.room,
    assignee: task.assignee,
    marking: task.marking,
    priority: task.priority,
    due_date: task.due_date.slice(0, 10),
    description: task.description,
  }
}

interface TaskFormProps {
  initial: TaskFormValues
  directories: Directories
  submitLabel: string
  // При создании необязательные поля свёрнуты, при редактировании раскрыты.
  detailsOpen: boolean
  onSubmit: (fields: TaskFields) => Promise<void>
}

export function TaskForm({ initial, directories, submitLabel, detailsOpen, onSubmit }: TaskFormProps) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function setField<K extends keyof TaskFormValues>(name: K, value: TaskFormValues[K]) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const title = values.title.trim()
    if (!values.system || !values.floor || !title) {
      setError("Заполните систему, этаж и название.")
      return
    }

    setSaving(true)
    setError("")
    try {
      await onSubmit({
        system: values.system,
        floor: values.floor,
        title,
        room: values.room,
        assignee: values.assignee,
        marking: values.marking.trim(),
        priority: values.priority,
        due_date: dateToDb(values.due_date),
        description: values.description.trim(),
      })
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setSaving(false)
    }
  }

  // В списке только помещения выбранного этажа.
  const floorRooms = directories.rooms.filter((room) => room.floor === values.floor)

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="panel space-y-4">
        <label className="block">
          <span className="label">Система</span>
          <select
            className="field"
            value={values.system}
            onChange={(event) => setField("system", event.target.value as TaskSystem | "")}
          >
            <option value="">Выберите систему</option>
            {TASK_SYSTEMS.map((system) => (
              <option key={system} value={system}>
                {SYSTEM_LABELS[system]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Этаж</span>
          <select
            className="field"
            value={values.floor}
            // Помещения у каждого этажа свои, поэтому при смене этажа помещение сбрасываем.
            onChange={(event) =>
              setValues((current) => ({ ...current, floor: event.target.value, room: "" }))
            }
          >
            <option value="">Выберите этаж</option>
            {directories.floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
        </label>

        {directories.floors.length === 0 && (
          <div className="space-y-2">
            <p className="font-semibold text-red-800">Этажей пока нет, сначала добавьте их.</p>
            <Link to="/directories" className="btn w-full">
              Этажи и помещения
            </Link>
          </div>
        )}

        <label className="block">
          <span className="label">Название</span>
          <input
            className="field"
            value={values.title}
            onChange={(event) => setField("title", event.target.value)}
          />
        </label>
      </div>

      <details open={detailsOpen} className="group border-2 border-gray-300 bg-white">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0">
            <span className="block font-semibold">Необязательные поля</span>
            <span className="block text-base leading-snug text-gray-700">
              Помещение, исполнитель, маркировка, срок
            </span>
          </span>
          <span className="group-open:rotate-180">
            <ChevronDownIcon />
          </span>
        </summary>
        <div className="space-y-4 border-t-2 border-gray-300 p-4">
          <label className="block">
            <span className="label">Помещение</span>
            <select
              className="field"
              value={values.room}
              disabled={!values.floor}
              onChange={(event) => setField("room", event.target.value)}
            >
              <option value="">{values.floor ? "Не указано" : "Сначала выберите этаж"}</option>
              {floorRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Исполнитель</span>
            <select
              className="field"
              value={values.assignee}
              onChange={(event) => setField("assignee", event.target.value)}
            >
              <option value="">Не назначен</option>
              {directories.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Маркировка</span>
            <input
              className="field font-mono font-bold"
              placeholder="ЩР-2.3 гр.5"
              value={values.marking}
              onChange={(event) => setField("marking", event.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Приоритет</span>
            <select
              className="field"
              value={values.priority}
              onChange={(event) => setField("priority", event.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Срок</span>
            <input
              type="date"
              className="field"
              value={values.due_date}
              onChange={(event) => setField("due_date", event.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Описание</span>
            <textarea
              className="field py-3"
              rows={3}
              value={values.description}
              onChange={(event) => setField("description", event.target.value)}
            />
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="border-2 border-red-700 bg-white p-3 font-semibold text-red-800">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? "Сохраняем…" : submitLabel}
      </button>
    </form>
  )
}
