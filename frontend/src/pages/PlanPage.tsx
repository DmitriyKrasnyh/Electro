import { useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { PlanViewer } from "../components/PlanViewer"
import { BlockedNote, MarkingTag, StatusBadge } from "../components/taskBits"
import { CloseIcon } from "../components/icons"
import { useGoBack } from "../hooks/useGoBack"
import { useLoad } from "../hooks/useLoad"
import { usePlanImage } from "../hooks/usePlanImage"
import { getPlanData, setRoomPoint, updateTask } from "../lib/data"
import { hasPlanPoint, nameById, roomLabel } from "../lib/format"
import { useSyncState } from "../lib/sync"
import { SYSTEM_LABELS, TASK_SYSTEMS, isTaskSystem } from "../types"

// План этажа. Режимы задаются адресом страницы:
// ?task=ID показать точку задачи, ?place=ID поставить точку существующей задаче,
// ?room=ID указать, где помещение, ?showRoom=ID показать помещение (из кабельного журнала).
export default function PlanPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { online } = useSyncState()

  const { data, error, reload } = useLoad(() => getPlanData(id), [id])
  const { url, failed } = usePlanImage(data?.plan)

  const [selectedId, setSelectedId] = useState(params.get("task"))
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const placeId = params.get("place")
  const placeRoomId = params.get("room")
  const showRoomId = params.get("showRoom")
  const backTo = placeId ? `/tasks/${placeId}` : placeRoomId ? "/directories" : "/plans"
  const backFromPlacing = useGoBack(backTo)

  const system = params.get("system") ?? ""
  const tasks = data?.tasks ?? []
  const placingTask = tasks.find((task) => task.id === placeId)
  const selectedTask = tasks.find((task) => task.id === selectedId)
  const floorRooms = (data?.directories.rooms ?? []).filter((room) => room.floor === id)
  const placingRoom = floorRooms.find((room) => room.id === placeRoomId)
  const shownRoom = floorRooms.find((room) => room.id === showRoomId)
  const placing = Boolean(placeId || placeRoomId)

  // Номера помещений. Помещение, которое сейчас переставляют, после нажатия показывается новой точкой.
  const labels = floorRooms
    .filter((room) => hasPlanPoint(room) && !(room.id === placeRoomId && draft))
    .map((room) => ({
      id: room.id,
      x: room.plan_x,
      y: room.plan_y,
      text: roomLabel(room.name),
      highlighted: room.id === showRoomId || room.id === placeRoomId,
    }))

  // Куда приблизиться при открытии: выбранная задача или нужное помещение.
  const focusRoom = shownRoom ?? placingRoom
  const focus =
    selectedTask && hasPlanPoint(selectedTask)
      ? { x: selectedTask.plan_x, y: selectedTask.plan_y }
      : focusRoom && hasPlanPoint(focusRoom)
        ? { x: focusRoom.plan_x, y: focusRoom.plan_y }
        : null

  const markers = tasks
    .filter((task) => hasPlanPoint(task) && (!system || task.system === system) && task.id !== placeId)
    .map((task) => ({
      id: task.id,
      x: task.plan_x,
      y: task.plan_y,
      title: task.title,
      status: task.status,
      blocked: task.blocked,
    }))

  function handleTapMarker(taskId: string) {
    setDraft(null)
    setSelectedId(taskId)
  }

  function handleTapPlan(x: number, y: number) {
    // Первое нажатие мимо точки просто закрывает её карточку.
    if (selectedId) {
      setSelectedId(null)
      return
    }
    setDraft({ x, y })
  }

  function setSystem(value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set("system", value)
        else next.delete("system")
        return next
      },
      { replace: true },
    )
    setSelectedId(null)
  }

  function createTaskHere() {
    if (!draft) return
    const query = new URLSearchParams({ floor: id, x: String(draft.x), y: String(draft.y) })
    if (isTaskSystem(system)) query.set("system", system)
    navigate(`/tasks/new?${query}`)
  }

  async function saveRoomPoint() {
    if (!draft || !placingRoom) return
    setSaving(true)
    try {
      await setRoomPoint(placingRoom, draft.x, draft.y)
      backFromPlacing()
    } finally {
      setSaving(false)
    }
  }

  async function saveTaskPoint() {
    if (!draft || !placingTask || !data) return
    setSaving(true)
    try {
      await updateTask(placingTask, { plan_x: draft.x, plan_y: draft.y }, data.directories)
      backFromPlacing()
    } finally {
      setSaving(false)
    }
  }

  // Что показать вместо плана, если его пока нельзя показать.
  function renderMessage() {
    if (!data) return <LoadStatus error={error} onRetry={reload} />
    if (!data.floor.plan) {
      return (
        <div className="panel space-y-3">
          <p>Для этого этажа план не загружен.</p>
          <Link to="/directories" className="btn w-full">
            Этажи и помещения
          </Link>
        </div>
      )
    }
    if (failed) {
      return (
        <div className="panel space-y-3">
          <p role="alert" className="font-semibold text-red-800">
            Не удалось открыть файл плана. Загрузите другой файл.
          </p>
          <Link to="/directories" className="btn w-full">
            Этажи и помещения
          </Link>
        </div>
      )
    }
    if (!data.plan) {
      return (
        <p className="panel" role={online ? undefined : "alert"}>
          {online ? "Загружаем план на устройство…" : "План ещё не загружен на это устройство. Нужна связь с сервером."}
        </p>
      )
    }
    return <p className="panel">Открываем план…</p>
  }

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader title={data?.floor.name ?? "План этажа"} backTo={backTo} />

      <main className="relative min-h-0 flex-1 bg-gray-300">
        {url ? (
          <PlanViewer
            // Новый файл плана: начинаем показ заново.
            key={url}
            imageUrl={url}
            markers={markers}
            labels={labels}
            selectedId={selectedId}
            draft={draft}
            focus={focus}
            // При расстановке точка может оказаться рядом с чужой, поэтому чужие не нажимаются.
            onTapMarker={placing ? undefined : handleTapMarker}
            onTapPlan={handleTapPlan}
          />
        ) : (
          <div className="p-3">{renderMessage()}</div>
        )}
      </main>

      {data && url && (
        <div className="border-t-2 border-gray-950 bg-white p-2">
          {/* Минимальная высота одна для всех режимов: иначе план подпрыгивал бы при каждом нажатии.
              На низком экране (телефон повёрнут) её нет: там каждый пиксель нужен самому плану. */}
          <div className="mx-auto max-w-3xl space-y-2 [@media(min-height:500px)]:min-h-34">
            {placeRoomId ? (
              <>
                <p className="leading-snug font-semibold break-words">
                  {draft ? "Помещение здесь:" : "Нажмите на план, где находится помещение:"}{" "}
                  {placingRoom?.name}
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={backFromPlacing}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary min-w-0 flex-1 px-2"
                    disabled={!draft || saving || !placingRoom}
                    onClick={() => void saveRoomPoint()}
                  >
                    Сохранить
                  </button>
                </div>
              </>
            ) : placeId ? (
              <>
                <p className="leading-snug font-semibold break-words">
                  {draft ? "Точка задачи:" : "Нажмите на план, где находится задача:"} {placingTask?.title}
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={backFromPlacing}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary min-w-0 flex-1 px-2"
                    disabled={!draft || saving}
                    onClick={() => void saveTaskPoint()}
                  >
                    Сохранить точку
                  </button>
                </div>
              </>
            ) : selectedTask ? (
              <>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="leading-snug font-semibold break-words">{selectedTask.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedTask.status} />
                      {selectedTask.marking && <MarkingTag marking={selectedTask.marking} />}
                    </div>
                    <p className="text-base leading-snug text-gray-800">
                      {[SYSTEM_LABELS[selectedTask.system], nameById(data.directories.rooms, selectedTask.room)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {selectedTask.blocked && <BlockedNote reason={selectedTask.blocked_reason} />}
                  </div>
                  <button
                    type="button"
                    className="btn w-14 shrink-0 px-0"
                    aria-label="Закрыть карточку точки"
                    onClick={() => setSelectedId(null)}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <Link to={`/tasks/${selectedTask.id}`} className="btn btn-primary w-full">
                  Открыть задачу
                </Link>
              </>
            ) : draft ? (
              <>
                <p className="font-semibold">Новая задача в этой точке</p>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setDraft(null)}>
                    Отмена
                  </button>
                  <button type="button" className="btn btn-primary min-w-0 flex-1 px-2" onClick={createTaskHere}>
                    Создать задачу
                  </button>
                </div>
              </>
            ) : (
              <>
                {shownRoom && (
                  <p className="leading-snug font-semibold break-words">
                    {hasPlanPoint(shownRoom)
                      ? `Помещение ${shownRoom.name}`
                      : `Помещение ${shownRoom.name} ещё не указано на плане`}
                  </p>
                )}
                <p className="text-base leading-snug text-gray-800 [@media(max-height:499px)]:hidden">
                  Нажмите на план: новая задача. На точку: её карточка.
                  {(data.plan?.pages ?? 1) > 1 && ` В файле страниц: ${data.plan?.pages}, показана первая.`}
                </p>
                <select
                  className="field"
                  aria-label="Показывать систему"
                  value={system}
                  onChange={(event) => setSystem(event.target.value)}
                >
                  <option value="">Все системы</option>
                  {TASK_SYSTEMS.map((value) => (
                    <option key={value} value={value}>
                      {SYSTEM_LABELS[value]}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
