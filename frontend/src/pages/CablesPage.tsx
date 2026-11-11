import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { LoadStatus } from "../components/LoadStatus"
import { PageHeader } from "../components/PageHeader"
import { CheckIcon, PinIcon } from "../components/icons"
import { useLoad } from "../hooks/useLoad"
import { useRestoreScroll } from "../hooks/useRestoreScroll"
import { getCableJournal, setCableStage, type Directories } from "../lib/data"
import { errorMessage, formatDateTime, hasPlanPoint, nameById } from "../lib/format"
import { CABLE_STAGES, CABLE_STAGE_LABELS, SYSTEM_LABELS, TASK_SYSTEMS, type CableLine, type CableStage } from "../types"

// Кабельный журнал: линии по проекту и отметки о ходе работ.
// Сначала выбирают, что отмечают (например, «Проведён»), потом нажимают на линии.
// Выбор этапа, системы и этажа хранится в адресе: после «Назад» он сохраняется.
export default function CablesPage() {
  const [params, setParams] = useSearchParams()
  const { data, error, reload } = useLoad(getCableJournal, [])
  const [search, setSearch] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  useRestoreScroll(Boolean(data))

  const stage = (CABLE_STAGES.find((value) => value === params.get("stage")) ?? "laid") as CableStage
  const system = params.get("system") ?? ""
  const floor = params.get("floor") ?? ""

  function setParam(name: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true },
    )
  }

  async function handleExport() {
    if (!data) return
    setExporting(true)
    setExportError("")
    try {
      const { downloadCableJournal } = await import("../lib/cableExport")
      await downloadCableJournal(data.lines, data.directories, data.object)
    } catch (exportFailure) {
      console.error("Выгрузка журнала", exportFailure)
      setExportError(errorMessage(exportFailure))
    } finally {
      setExporting(false)
    }
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Кабельный журнал" backTo="/" />
        <main className="page">
          <LoadStatus error={error} onRetry={reload} />
        </main>
      </>
    )
  }

  const { lines, directories } = data
  const systems = TASK_SYSTEMS.filter((value) => lines.some((line) => line.system === value))
  const query = search.trim().toLowerCase()
  const visible = lines.filter(
    (line) =>
      (!system || line.system === system) &&
      (!floor || line.floor === floor) &&
      (!query ||
        line.marking.toLowerCase().includes(query) ||
        line.to_point.toLowerCase().includes(query) ||
        nameById(directories.rooms, line.room).toLowerCase().includes(query)),
  )
  const groups = groupLines(visible, directories)

  return (
    <>
      <PageHeader title="Кабельный журнал" subtitle={data.object?.name} backTo="/" />
      <main className="page">
        {lines.length === 0 ? (
          <p className="panel">Журнал пока пуст. Линии из проекта загружает администратор.</p>
        ) : (
          <>
            <section className="panel space-y-4">
              <div>
                <p className="label">Что отмечаем</p>
                <div className="grid grid-cols-2 gap-2">
                  {CABLE_STAGES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={value === stage}
                      onClick={() => setParam("stage", value === "laid" ? "" : value)}
                      // «Промаркирован» на узком экране едва помещается: шрифт чуть меньше обычного.
                      // Кнопок пять: последняя на всю ширину, чтобы не оставалось дыры.
                      className={`btn px-1 text-base last:col-span-2 ${value === stage ? "btn-primary" : "border-gray-400 font-medium"}`}
                    >
                      {CABLE_STAGE_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {systems.length > 1 && (
                  <label className="block">
                    <span className="label">Система</span>
                    <select className="field" value={system} onChange={(event) => setParam("system", event.target.value)}>
                      <option value="">Все системы</option>
                      {systems.map((value) => (
                        <option key={value} value={value}>
                          {SYSTEM_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="label">Этаж</span>
                  <select className="field" value={floor} onChange={(event) => setParam("floor", event.target.value)}>
                    <option value="">Все этажи</option>
                    {directories.floors.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="label">Поиск</span>
                <input
                  className="field"
                  type="search"
                  placeholder="Маркировка или помещение"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <Summary lines={visible} stage={stage} />
            </section>

            {groups.length === 0 && <p className="text-gray-700">Ничего не найдено.</p>}
            {groups.map((group) => (
              <LineGroup
                key={group.key}
                title={group.title}
                roomId={group.roomId}
                lines={group.lines}
                stage={stage}
                directories={directories}
              />
            ))}

            <section className="panel space-y-3">
              <h2 className="panel-title">Исполнительная документация</h2>
              <p className="text-base text-gray-700">
                Весь журнал в формате проекта: по листу на систему и лист «Ход работ» с датами и исполнителями. У
                проведённых линий длина берётся проектная.
              </p>
              {exportError && (
                <p role="alert" className="font-semibold text-red-800">
                  {exportError}
                </p>
              )}
              <button type="button" className="btn w-full" disabled={exporting} onClick={() => void handleExport()}>
                {exporting ? "Готовим файл…" : "Скачать Excel"}
              </button>
            </section>
          </>
        )}
      </main>
    </>
  )
}

// --- Сводка: сколько линий и метров отмечено ---

function Summary({ lines, stage }: { lines: CableLine[]; stage: CableStage }) {
  const total = lines.length
  const meters = sumMeters(lines)
  const doneLines = lines.filter((line) => line[`${stage}_at`])
  return (
    <div className="space-y-1">
      <p className="text-lg font-bold">
        {CABLE_STAGE_LABELS[stage]}: {doneLines.length} из {total} {linesWord(total)}
      </p>
      <p className="text-base text-gray-800">
        {formatMeters(sumMeters(doneLines))} из {formatMeters(meters)} м по проекту
      </p>
      <div className="h-3 w-full bg-gray-200" aria-hidden>
        <div className="h-3 bg-green-700" style={{ width: `${total ? (doneLines.length / total) * 100 : 0}%` }} />
      </div>
    </div>
  )
}

// --- Группа линий: одно помещение или одна система на этаже ---

interface LineGroupProps {
  title: string
  roomId: string // пусто, если группа не помещение (например, камеры этажа)
  lines: CableLine[]
  stage: CableStage
  directories: Directories
}

function LineGroup({ title, roomId, lines, stage, directories }: LineGroupProps) {
  const [error, setError] = useState("")
  // Помещение, указанное на плане своего этажа, можно сразу там и показать.
  const room = directories.rooms.find((item) => item.id === roomId)
  const roomFloor = directories.floors.find((item) => item.id === room?.floor)
  const planLink = room && roomFloor?.plan && hasPlanPoint(room) ? `/floors/${roomFloor.id}/plan?showRoom=${room.id}` : ""
  const done = lines.filter((line) => line[`${stage}_at`]).length
  const left = lines.length - done

  async function change(targets: CableLine[], value: boolean) {
    setError("")
    try {
      await setCableStage(targets, stage, value)
    } catch (changeError) {
      setError(errorMessage(changeError))
    }
  }

  function markAll() {
    const question = `Отметить «${CABLE_STAGE_LABELS[stage]}» у всех линий группы «${title}» (${left})?`
    if (window.confirm(question)) void change(lines, true)
  }

  return (
    <section className="space-y-2">
      {/* Заголовок на всю ширину: рядом с кнопкой длинные названия переносились посреди слова. */}
      <div className="space-y-1 pt-2">
        <h2 className="text-xl leading-tight font-bold break-words">{title}</h2>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="text-lg font-semibold text-gray-700 tabular-nums">
            {done} из {lines.length}
          </span>
          <div className="flex shrink-0 gap-2">
            {planLink && (
              <Link to={planLink} className="btn w-14 px-0" aria-label={`Показать на плане: ${title}`}>
                <PinIcon />
              </Link>
            )}
            {left > 1 && (
              <button type="button" className="btn px-3 text-base" onClick={markAll}>
                Отметить все
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="font-semibold text-red-800">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {lines.map((line) => (
          <LineButton key={line.id} line={line} stage={stage} directories={directories} onToggle={(value) => void change([line], value)} />
        ))}
      </div>
    </section>
  )
}

// --- Одна линия: большая кнопка, нажатие ставит или снимает отметку выбранного этапа ---

interface LineButtonProps {
  line: CableLine
  stage: CableStage
  directories: Directories
  onToggle: (done: boolean) => void
}

function LineButton({ line, stage, directories, onToggle }: LineButtonProps) {
  const doneAt = line[`${stage}_at`]
  // Состояние кабеля видно всегда, отметки показываем те, что уже стоят (кроме выбранной сверху).
  const state = line.box_at ? "Выведен в подрозетник" : line.laid_at ? "Проведён" : "Не проведён"
  const otherDone = CABLE_STAGES.filter(
    (other) => other !== "laid" && other !== "box" && other !== stage && line[`${other}_at`],
  )
  return (
    <button
      type="button"
      aria-pressed={Boolean(doneAt)}
      onClick={() => onToggle(!doneAt)}
      className={`flex min-h-16 w-full items-center gap-3 border-2 px-3 py-2 text-left select-none ${
        doneAt ? "border-green-800 bg-green-50 active:bg-green-100" : "border-gray-400 bg-white active:bg-gray-200"
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center border-2 ${
          doneAt ? "border-green-800 bg-green-700 text-white" : "border-gray-500 bg-white"
        }`}
      >
        {doneAt && <CheckIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-lg font-bold">{line.marking}</span>
          <span className="text-base text-gray-800">
            {line.from_point} → {line.to_point} · {formatMeters(Number(line.design_length))} м
          </span>
        </span>
        {doneAt && (
          <span className="block text-base text-green-900">
            {formatDateTime(doneAt)}, {nameById(directories.users, line[`${stage}_by`]) || "—"}
          </span>
        )}
        <span className="block text-sm text-gray-700">
          {[state, ...otherDone.map((other) => CABLE_STAGE_LABELS[other])].join(" · ")}
        </span>
      </span>
    </button>
  )
}

// --- Вспомогательные функции ---

// Линии интернета группируются по помещению, остальные по системе и этажу.
function groupLines(lines: CableLine[], directories: Directories) {
  const groups = new Map<string, { key: string; title: string; roomId: string; lines: CableLine[] }>()
  for (const line of lines) {
    const room = nameById(directories.rooms, line.room)
    const key = room ? `room:${line.room}` : `system:${line.system}:${line.floor}`
    const title = room || [SYSTEM_LABELS[line.system], nameById(directories.floors, line.floor)].filter(Boolean).join(", ")
    const group = groups.get(key) ?? { key, title, roomId: room ? line.room : "", lines: [] }
    group.lines.push(line)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function sumMeters(lines: CableLine[]): number {
  return lines.reduce((sum, line) => sum + Number(line.design_length), 0)
}

function formatMeters(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
}

// «из 1 линии», «из 21 линии», но «из 11 линий», «из 142 линий».
function linesWord(count: number): string {
  return count % 10 === 1 && count % 100 !== 11 ? "линии" : "линий"
}
