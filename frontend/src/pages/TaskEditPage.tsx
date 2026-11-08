import { useRef } from "react"
import { useParams } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { TaskForm, formValuesFromTask } from "../components/TaskForm"
import { useGoBack } from "../hooks/useGoBack"
import { useLoad } from "../hooks/useLoad"
import { getDirectories, getTask, updateTask, type TaskFields } from "../lib/data"
import type { Task } from "../types"

export default function TaskEditPage() {
  const { id = "" } = useParams()
  const goBack = useGoBack(`/tasks/${id}`)

  const { data, error, reload } = useLoad(async () => {
    const [task, directories] = await Promise.all([getTask(id), getDirectories()])
    return { task, directories }
  }, [id])

  // Задача, какой она была при открытии формы. Сравниваем форму именно с ней: данные на
  // устройстве могут обновиться, пока форма открыта, и старое значение поля, которое никто
  // не трогал, выглядело бы как новая правка и затёрло бы правку коллеги.
  const openedTask = useRef<Task | null>(null)
  if (data && !openedTask.current) openedTask.current = data.task

  async function handleSubmit(fields: TaskFields) {
    if (!data || !openedTask.current) return
    await updateTask(openedTask.current, fields, data.directories)
    goBack()
  }

  return (
    <>
      <PageHeader title="Изменить задачу" backTo={`/tasks/${id}`} />
      <main className="page">
        {!data || !openedTask.current ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <TaskForm
            initial={formValuesFromTask(openedTask.current)}
            directories={data.directories}
            submitLabel="Сохранить"
            detailsOpen
            onSubmit={handleSubmit}
          />
        )}
      </main>
    </>
  )
}
