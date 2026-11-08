import { useState } from "react"
import { Link, useParams } from "react-router"
import { BlockPanel } from "../components/BlockPanel"
import { ChecklistPanel } from "../components/ChecklistPanel"
import { HistoryList } from "../components/HistoryList"
import { PencilIcon } from "../components/icons"
import { LoadStatus } from "../components/LoadStatus"
import { MarkingPanel } from "../components/MarkingPanel"
import { PageHeader } from "../components/PageHeader"
import { PhotoGallery } from "../components/PhotoGallery"
import { PlanPointPanel } from "../components/PlanPointPanel"
import { SaveErrorBanner } from "../components/SaveErrorBanner"
import { StatusPicker } from "../components/StatusPicker"
import { useLoad } from "../hooks/useLoad"
import { useRestoreScroll } from "../hooks/useRestoreScroll"
import { getDirectories, getHistory, getPhotos, getTask, updateTask, type TaskChanges } from "../lib/data"
import { formatDate, isOverdue, nameById } from "../lib/format"
import { PRIORITY_LABELS, SYSTEM_LABELS } from "../types"

export default function TaskDetailPage() {
  const { id = "" } = useParams()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)

  const { data, error, reload } = useLoad(async () => {
    const [task, directories, history, photos] = await Promise.all([
      getTask(id),
      getDirectories(),
      getHistory(id),
      getPhotos(id),
    ])
    return { task, directories, history, photos }
  }, [id])

  useRestoreScroll(Boolean(data))

  // Единая точка сохранения для всех панелей карточки. Экран обновится сам.
  // Возвращает true при успехе, чтобы панель могла закрыть свою форму.
  async function save(changes: TaskChanges): Promise<boolean> {
    if (!data) return false
    setSaving(true)
    setSaveError(null)
    try {
      await updateTask(data.task, changes, data.directories)
      return true
    } catch (updateError) {
      setSaveError(updateError)
      return false
    } finally {
      setSaving(false)
    }
  }

  const task = data?.task

  return (
    <>
      <PageHeader
        title={task ? SYSTEM_LABELS[task.system] : "Задача"}
        backTo={task ? `/systems/${task.system}` : "/"}
        right={
          task && (
            // Значок вместо текста: иначе длинное название системы не помещается в шапке.
            <Link
              to={`/tasks/${task.id}/edit`}
              className="btn btn-header w-14 shrink-0 px-0"
              aria-label="Изменить задачу"
            >
              <PencilIcon />
            </Link>
          )
        }
      />
      <main className={`page ${saveError != null ? "pb-36" : ""}`}>
        {!data || !task ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            <section className="panel space-y-3">
              <h2 className="text-2xl leading-tight font-bold break-words">{task.title}</h2>
              <p className="leading-snug font-semibold">
                {[nameById(data.directories.floors, task.floor), nameById(data.directories.rooms, task.room)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <dl className="space-y-1 text-base">
                <Detail label="Исполнитель" value={nameById(data.directories.users, task.assignee) || "Не назначен"} />
                <Detail label="Приоритет" value={PRIORITY_LABELS[task.priority]} />
                {task.due_date && (
                  <Detail
                    label="Срок"
                    value={`${formatDate(task.due_date)}${isOverdue(task) ? ", просрочено" : ""}`}
                    alert={isOverdue(task)}
                  />
                )}
              </dl>
              {task.description && <p className="leading-snug break-words whitespace-pre-line">{task.description}</p>}
            </section>

            <StatusPicker
              status={task.status}
              disabled={saving}
              onChange={(status) => void save({ status })}
            />
            <BlockPanel task={task} disabled={saving} onSave={save} />
            <MarkingPanel marking={task.marking} disabled={saving} onSave={save} />
            <PlanPointPanel task={task} floor={data.directories.floors.find((floor) => floor.id === task.floor)} />

            {/* Чек-лист нужен в первую очередь для щитов. У других систем показываем его, если он уже заполнен. */}
            {(task.system === "panels" || (task.checklist?.length ?? 0) > 0) && (
              <ChecklistPanel checklist={task.checklist} disabled={saving} onSave={save} />
            )}

            <PhotoGallery taskId={task.id} photos={data.photos} users={data.directories.users} />
            <HistoryList task={task} history={data.history} users={data.directories.users} />
          </>
        )}
      </main>
      {saveError != null && <SaveErrorBanner error={saveError} />}
    </>
  )
}

function Detail({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-gray-700">{label}:</dt>
      <dd className={`font-semibold ${alert ? "text-red-800" : ""}`}>{value}</dd>
    </div>
  )
}
