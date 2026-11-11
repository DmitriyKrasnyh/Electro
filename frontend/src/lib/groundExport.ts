import type { Directories } from "./data"
import { formatDateTime, nameById } from "./format"
import type { GroundMeasurement, ProjectObject } from "../types"

// Протокол замеров сопротивления заземления в Excel. Библиотека загружается только здесь.

const thin = { style: "thin" as const }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }

export async function downloadGroundProtocol(
  measurements: GroundMeasurement[],
  directories: Directories,
  object: ProjectObject | null,
) {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Электромонтаж"
  const today = new Date()
  const sheet = workbook.addWorksheet("Замеры", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = [6, 16, 28, 12, 26, 14, 12, 14, 18, 16, 28].map((width) => ({ width }))

  sheet.mergeCells("A1:K1")
  sheet.getCell("A1").value = "Протокол замеров сопротивления заземления"
  sheet.getCell("A1").font = { bold: true, size: 12 }
  sheet.mergeCells("A2:K2")
  sheet.getCell("A2").value = [object?.name, object?.address, `на ${today.toLocaleDateString("ru-RU")}`]
    .filter(Boolean)
    .join(" · ")

  const header = sheet.getRow(4)
  header.values = [
    "№",
    "Дата и время",
    "Место замера",
    "Этаж",
    "Помещение",
    "Сопротивление, Ом",
    "Норма, Ом",
    "Соответствие",
    "Прибор",
    "Кто мерил",
    "Комментарий",
  ]
  header.height = 32
  header.eachCell((cell) => {
    cell.font = { bold: true }
    cell.border = BORDER
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  })

  // Старые сверху: так протокол читается по порядку работ.
  const ordered = [...measurements].sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  ordered.forEach((item, index) => {
    const ok = Number(item.resistance) <= Number(item.norm)
    const row = sheet.addRow([
      index + 1,
      formatDateTime(item.measured_at),
      item.place,
      nameById(directories.floors, item.floor),
      nameById(directories.rooms, item.room),
      Number(item.resistance),
      Number(item.norm),
      ok ? "Соответствует" : "Не соответствует",
      item.instrument,
      nameById(directories.users, item.measured_by),
      item.comment,
    ])
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = BORDER
      cell.alignment = { vertical: "middle", wrapText: true }
    })
    if (!ok) row.getCell(8).font = { bold: true, color: { argb: "FFB91C1C" } }
  })
  sheet.views = [{ state: "frozen", ySplit: 4 }]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `Протокол заземления ${today.toLocaleDateString("ru-RU")}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
