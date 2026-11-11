import { Link } from "react-router"
import { AddTaskButton } from "../components/AddTaskButton"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { SystemCard } from "../components/SystemCard"
import { TaskCard } from "../components/TaskCard"
import { useLoad } from "../hooks/useLoad"
import { useRestoreScroll } from "../hooks/useRestoreScroll"
import { logout, useCurrentUser } from "../lib/auth"
import { getDirectories, getTasks, waitingOn, type Directories } from "../lib/data"
import { sortTasks } from "../lib/format"
import { useInstallPrompt } from "../lib/install"
import { TASK_SYSTEMS, type Task } from "../types"

export default function HomePage() {
  const user = useCurrentUser()
  const install = useInstallPrompt()
  const { data, error, reload } = useLoad(async () => {
    const [tasks, directories] = await Promise.all([getTasks(), getDirectories()])
    return { tasks, directories, tasksById: new Map(tasks.map((task) => [task.id, task])) }
  }, [])

  useRestoreScroll(Boolean(data))

  async function handleLogout() {
    const unsent = await logout()
    if (unsent > 0) {
      window.alert(
        `Выйти пока нельзя: есть неотправленные изменения (${unsent}). ` +
          "Выход стирает данные с этого устройства, и они бы пропали.",
      )
    }
  }

  return (
    <>
      <PageHeader
        title="Электромонтаж"
        subtitle={user?.name}
        right={
          <button type="button" className="btn btn-header" onClick={() => void handleLogout()}>
            Выйти
          </button>
        }
      />
      <main className="page pb-24">
        {!data ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              {TASK_SYSTEMS.map((system) => (
                <SystemCard
                  key={system}
                  system={system}
                  tasks={data.tasks.filter((task) => task.system === system)}
                />
              ))}
            </section>

            <div className="grid grid-cols-2 gap-2">
              <Link to="/plans" className="btn w-full px-2">
                Планы этажей
              </Link>
              <Link to="/cables" className="btn w-full px-2">
                Кабельный журнал
              </Link>
              <Link to="/documents" className="btn w-full px-2">
                Документы
              </Link>
              <Link to="/grounding" className="btn w-full px-2">
                Замеры заземления
              </Link>
            </div>

            <TaskSection
              title="Мои задачи"
              emptyText="Открытых задач на вас нет."
              // Сданные задачи здесь только мешали бы, они остаются в списках систем.
              tasks={data.tasks.filter((task) => task.assignee === user?.id && task.status !== "done")}
              directories={data.directories}
              tasksById={data.tasksById}
            />
            <TaskSection
              title="Заблокировано"
              emptyText="Заблокированных задач нет."
              tasks={data.tasks.filter((task) => task.blocked)}
              directories={data.directories}
              tasksById={data.tasksById}
            />

            <div className="space-y-2">
              <Link to="/directories" className="btn w-full">
                Этажи и помещения
              </Link>
              <Link to="/sync" className="btn w-full">
                Отправка изменений
              </Link>
              <Link to="/password" className="btn w-full">
                Пароль
              </Link>
              {install && (
                <button type="button" className="btn w-full" onClick={install}>
                  Установить на экран телефона
                </button>
              )}
            </div>
          </>
        )}
      </main>
      <AddTaskButton to="/tasks/new" />
    </>
  )
}

interface TaskSectionProps {
  title: string
  emptyText: string
  tasks: Task[]
  directories: Directories
  tasksById: Map<string, Task>
}

function TaskSection({ title, emptyText, tasks, directories, tasksById }: TaskSectionProps) {
  return (
    <section>
      <h2 className="mb-2 pt-2 text-xl font-bold">
        {title} <span className="font-semibold text-gray-700 tabular-nums">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-gray-700">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {sortTasks(tasks).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              directories={directories}
              showSystem
              waitingOn={waitingOn(task, tasksById)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
