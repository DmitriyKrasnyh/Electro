import { useState } from "react"
import { AddItemForm } from "../components/AddItemForm"
import { EditableName } from "../components/EditableName"
import { FloorPlanControls } from "../components/FloorPlanControls"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { SaveErrorBanner } from "../components/SaveErrorBanner"
import { useLoad } from "../hooks/useLoad"
import {
  createFloor,
  createRoom,
  getDirectories,
  getProjectObject,
  renameFloor,
  renameRoom,
} from "../lib/data"

// Справочники: этажи, их планы и помещения.
export default function DirectoriesPage() {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)

  const { data, error, reload } = useLoad(async () => {
    const [object, directories] = await Promise.all([getProjectObject(), getDirectories()])
    return { object, directories }
  }, [])

  // Общая обёртка для всех сохранений на экране. Возвращает true при успехе.
  async function run(action: () => Promise<void>): Promise<boolean> {
    setSaving(true)
    setSaveError(null)
    try {
      await action()
      return true
    } catch (actionError) {
      setSaveError(actionError)
      return false
    } finally {
      setSaving(false)
    }
  }

  const object = data?.object
  const floors = data?.directories.floors ?? []
  const rooms = data?.directories.rooms ?? []
  // Новый этаж ставим в конец списка.
  const nextOrder = Math.max(0, ...floors.map((floor) => floor.order)) + 1

  return (
    <>
      <PageHeader title="Этажи и помещения" subtitle={object?.name} backTo="/" />
      <main className={`page ${saveError != null ? "pb-36" : ""}`}>
        {!data ? (
          <LoadStatus error={error} onRetry={reload} />
        ) : !object ? (
          // Этаж нельзя создать без объекта, а отдельного экрана для объекта в MVP нет.
          <p className="panel">
            Объект ещё не создан. Администратору нужно добавить его в панели Supabase: таблица{" "}
            <span className="font-mono font-bold">objects</span>.
          </p>
        ) : (
          <>
            {floors.map((floor) => (
              <section key={floor.id} className="panel">
                <EditableName
                  name={floor.name}
                  disabled={saving}
                  textClassName="text-xl font-bold"
                  onSave={(name) => run(() => renameFloor(floor.id, name))}
                />
                <FloorPlanControls floor={floor} />
                <ul className="mt-2 divide-y-2 divide-gray-200 border-y-2 border-gray-200">
                  {rooms
                    .filter((room) => room.floor === floor.id)
                    .map((room) => (
                      <li key={room.id}>
                        <EditableName
                          name={room.name}
                          disabled={saving}
                          onSave={(name) => run(() => renameRoom(room.id, name))}
                        />
                      </li>
                    ))}
                </ul>
                <div className="mt-3">
                  <AddItemForm
                    placeholder="Помещение"
                    label="Новое помещение"
                    disabled={saving}
                    onAdd={(name) => run(() => createRoom(floor.id, name))}
                  />
                </div>
              </section>
            ))}

            {floors.length === 0 && <p className="text-gray-700">Этажей пока нет.</p>}

            <section className="panel">
              <AddItemForm
                placeholder="Этаж"
                label="Новый этаж"
                disabled={saving}
                onAdd={(name) => run(() => createFloor(object.id, name, nextOrder))}
              />
            </section>
          </>
        )}
      </main>
      {saveError != null && <SaveErrorBanner error={saveError} />}
    </>
  )
}
