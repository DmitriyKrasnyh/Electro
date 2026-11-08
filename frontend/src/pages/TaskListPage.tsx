import { Navigate, useParams, useSearchParams } from "react-router"
import { AddTaskButton } from "../components/AddTaskButton"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { TaskCard } from "../components/TaskCard"
import { useLoad } from "../hooks/useLoad"
import { useRestoreScroll } from "../hooks/useRestoreScroll"
import { getDirectories, getTasks } from "../lib/data"
import { sortTasks } from "../lib/format"
import { STATUS_LABELS, SYSTEM_LABELS, TASK_STATUSES, isTaskSystem, type TaskSystem } from "../types"

// Значение фильтра «Исполнитель» для задач, у которых исполнителя нет.
const NO_ASSIGNEE = "none"

export default function TaskListPage() {
  const { system } = useParams()
  // Фильтры лежат в адресе страницы: они сохранятся при возврате из карточки задачи.
  const [params, setParams] = useSearchParams()

  const { data, error, reload } = useLoad(async () => {
    const [tasks, directories] = await Promise.all([
      getTasks(system as TaskSystem),
      getDirectories(),
    ])
    return { tasks, directories }
  }, [system])

  useRestoreScroll(Boolean(data))

  if (!isTaskSystem(system)) return <Navigate to="/" replace />

  const floor = params.get("floor") ?? ""
  const status = params.get("status") ?? ""
  const assignee = params.get("assignee") ?? ""
  const blockedOnly = params.get("blocked") === "1"
  const hasFilters = Boolean(floor || status || assignee || blockedOnly)

  function setFilter(name: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      // replace: кнопка «Назад» не должна перебирать все смены фильтров.
      { replace: true },
    )
  }

  const tasks = sortTasks(
    (data?.tasks ?? []).filter((task) => {
      if (floor && task.floor !== floor) return false
      if (status && task.status !== status) return false
      if (blockedOnly && !task.blocked) return false
      if (assignee === NO_ASSIGNEE) return task.assignee === ""
      if (assignee && task.assignee !== assignee) return false
      return true
    }),
  )

  // Новая задача сразу получит систему и выбранный в фильтре этаж.
  const newTaskParams = new URLSearchParams({ system })
  if (floor) newTaskParams.set("floor", floor)

  return (
    <>
      <PageHeader title={SYSTEM_LABELS[system]} backTo="/" />
      <main className="page pb-24">
        {!data ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            <section className="panel grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block min-w-0">
                <span className="label">Этаж</span>
                <select
                  className="field"
                  value={floor}
                  onChange={(event) => setFilter("floor", event.target.value)}
                >
                  <option value="">Все</option>
                  {data.directories.floors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="label">Статус</span>
                <select
                  className="field"
                  value={status}
                  onChange={(event) => setFilter("status", event.target.value)}
                >
                  <option value="">Все</option>
                  {TASK_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {STATUS_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="label">Исполнитель</span>
                <select
                  className="field"
                  value={assignee}
                  onChange={(event) => setFilter("assignee", event.target.value)}
                >
                  <option value="">Все</option>
                  <option value={NO_ASSIGNEE}>Не назначен</option>
                  {data.directories.users.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                aria-pressed={blockedOnly}
                onClick={() => setFilter("blocked", blockedOnly ? "" : "1")}
                className={`btn self-end px-2 text-base ${
                  blockedOnly ? "border-red-700 bg-red-700 text-white active:bg-red-800" : "btn-danger"
                }`}
              >
                Только блокировки
              </button>
            </section>

            <div className="flex min-h-14 items-center justify-between gap-3">
              <p className="font-semibold tabular-nums">Задач: {tasks.length}</p>
              {hasFilters && (
                <button type="button" className="btn" onClick={() => setParams({}, { replace: true })}>
                  Сбросить фильтры
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <p className="text-gray-700">
                {hasFilters ? "По этим фильтрам задач нет." : "В этой системе задач пока нет."}
              </p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} directories={data.directories} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <AddTaskButton to={`/tasks/new?${newTaskParams}`} />
    </>
  )
}
