import { Link } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { useLoad } from "../hooks/useLoad"
import { getDirectories, getTasks } from "../lib/data"
import { hasPlanPoint } from "../lib/format"

// Список этажей: отсюда открываются планы.
export default function PlansPage() {
  const { data, error, reload } = useLoad(async () => {
    const [directories, tasks] = await Promise.all([getDirectories(), getTasks()])
    return { floors: directories.floors, tasks }
  }, [])

  return (
    <>
      <PageHeader title="Планы этажей" backTo="/" />
      <main className="page">
        {!data ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : (
          <>
            {data.floors.length === 0 && <p className="text-gray-700">Этажей пока нет.</p>}
            <div className="space-y-3">
              {data.floors.map((floor) =>
                floor.plan ? (
                  <Link key={floor.id} to={`/floors/${floor.id}/plan`} className="panel block active:bg-gray-200">
                    <span className="block text-xl font-bold break-words">{floor.name}</span>
                    <span className="block text-base text-gray-700">
                      Точек на плане:{" "}
                      {data.tasks.filter((task) => task.floor === floor.id && hasPlanPoint(task)).length}
                    </span>
                  </Link>
                ) : (
                  <div key={floor.id} className="panel">
                    <span className="block text-xl font-bold break-words">{floor.name}</span>
                    <span className="block text-base text-gray-700">План не загружен</span>
                  </div>
                ),
              )}
            </div>
            <Link to="/directories" className="btn w-full">
              Загрузить планы
            </Link>
          </>
        )}
      </main>
    </>
  )
}
