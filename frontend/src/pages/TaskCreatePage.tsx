import { useNavigate, useSearchParams } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { TaskForm, emptyFormValues } from "../components/TaskForm"
import { useLoad } from "../hooks/useLoad"
import { createTask, getDirectories, type TaskFields } from "../lib/data"
import { nameById } from "../lib/format"
import { isTaskSystem } from "../types"

export default function TaskCreatePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: directories, error, reload } = useLoad(getDirectories, [])

  // Система и этаж могут прийти из адреса, если задачу создают из списка системы или с плана.
  const systemParam = params.get("system") ?? ""
  const system = isTaskSystem(systemParam) ? systemParam : ""
  const floor = params.get("floor") ?? ""

  // Точка, которую поставили на плане. Проверяем значения: адрес можно открыть и вручную.
  const x = Number(params.get("x"))
  const y = Number(params.get("y"))
  const planPoint = x > 0 && x <= 100 && y > 0 && y <= 100 ? { x, y } : undefined

  async function handleSubmit(fields: TaskFields) {
    // Точка относится к этажу, на плане которого её поставили.
    const task = await createTask(fields, fields.floor === floor ? planPoint : undefined)
    // replace: кнопка «Назад» из новой задачи не должна снова открывать форму.
    navigate(`/tasks/${task.id}`, { replace: true })
  }

  const backTo = planPoint ? `/floors/${floor}/plan` : system ? `/systems/${system}` : "/"

  return (
    <>
      <PageHeader title="Новая задача" backTo={backTo} />
      <main className="page">
        {!directories ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            {planPoint && (
              <p className="panel font-semibold">Точка на плане: {nameById(directories.floors, floor)}</p>
            )}
            <TaskForm
              initial={emptyFormValues(system, floor)}
              directories={directories}
              submitLabel="Создать задачу"
              detailsOpen={false}
              onSubmit={handleSubmit}
            />
          </>
        )}
      </main>
    </>
  )
}
