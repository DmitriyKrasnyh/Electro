import type { Directories } from "./data"
import { formatDateTime, nameById } from "./format"
import { CABLE_STAGES, CABLE_STAGE_LABELS, SYSTEM_LABELS, TASK_SYSTEMS, type CableLine, type ProjectObject } from "../types"

// Выгрузка кабельного журнала в Excel. Каждая система на своём листе, в форме журнала
// из проекта: «по проекту» и «проложен». Колонки «проложен» заполняются у линий с отметкой
// «Проложен»: длину монтажники не мерят, поэтому берётся проектная.
// Последний лист «Ход работ»: кто и когда отметил каждый этап.
// Библиотека большая, поэтому загружается только при нажатии «Скачать».

const SHEET_NAMES: Record<string, string> = {
  video: "СОТ",
  scs: "СКС (интернет)",
  electric: "Электрика",
}

const thin = { style: "thin" as const }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }

export async function downloadCableJournal(lines: CableLine[], directories: Directories, object: ProjectObject | null) {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Электромонтаж"
  const today = new Date()

  for (const system of TASK_SYSTEMS) {
    const systemLines = lines.filter((line) => line.system === system)
    if (systemLines.length === 0) continue
    const sheet = workbook.addWorksheet(SHEET_NAMES[system] ?? SYSTEM_LABELS[system], {
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    sheet.columns = [12, 14, 26, 26, 12, 10, 26, 12, 10].map((width) => ({ width }))

    // Заголовок
    sheet.mergeCells("A1:I1")
    sheet.getCell("A1").value = `Кабельный журнал. ${SYSTEM_LABELS[system]}`
    sheet.getCell("A1").font = { bold: true, size: 12 }
    sheet.mergeCells("A2:I2")
    sheet.getCell("A2").value = [object?.name, object?.address, `на ${today.toLocaleDateString("ru-RU")}`]
      .filter(Boolean)
      .join(" · ")

    // Шапка таблицы, как в проектном журнале
    sheet.mergeCells("A3:A4")
    sheet.mergeCells("B3:C3")
    sheet.mergeCells("D3:F3")
    sheet.mergeCells("G3:I3")
    sheet.getCell("A3").value = "Маркировка кабеля"
    sheet.getCell("B3").value = "Трасса"
    sheet.getCell("D3").value = "По проекту"
    sheet.getCell("G3").value = "Проложен"
    const subheaders = ["Начало", "Конец", "Марка", "Количество кабелей, число и сечение жил", "Длина, м"]
    sheet.getRow(4).values = ["", ...subheaders, "Марка", "Количество кабелей, число и сечение жил", "Длина, м"]
    sheet.getRow(5).values = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (const rowNumber of [3, 4, 5]) {
      const row = sheet.getRow(rowNumber)
      for (let column = 1; column <= 9; column++) {
        const cell = row.getCell(column)
        cell.border = BORDER
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
        if (rowNumber < 5) cell.font = { bold: true }
      }
    }
    sheet.getRow(4).height = 45

    // Линии
    for (const line of systemLines) {
      const laid = Boolean(line.laid_at)
      const row = sheet.addRow([
        line.marking,
        line.from_point,
        line.to_point,
        line.cable_brand,
        line.cores,
        Number(line.design_length),
        laid ? line.laid_brand || line.cable_brand : "",
        laid ? line.cores : "",
        laid ? Number(line.design_length) : "",
      ])
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.border = BORDER
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: column === 6 || column === 9 ? "center" : "left" }
      })
    }

    // Итого по каждой марке: по проекту и фактически проложено
    const brands = [...new Set(systemLines.map((line) => line.cable_brand))]
    brands.forEach((brand, index) => {
      const ofBrand = systemLines.filter((line) => line.cable_brand === brand)
      const design = ofBrand.reduce((sum, line) => sum + Number(line.design_length), 0)
      const laidLines = ofBrand.filter((line) => line.laid_at)
      const laid = laidLines.reduce((sum, line) => sum + Number(line.design_length), 0)
      const row = sheet.addRow([
        index === 0 ? "Итого:" : "",
        "",
        "",
        brand,
        "",
        design,
        laidLines.length > 0 ? brand : "",
        "",
        laidLines.length > 0 ? laid : "",
      ])
      row.font = { bold: true }
      row.eachCell({ includeEmpty: true }, (cell) => (cell.border = BORDER))
    })
    sheet.views = [{ state: "frozen", ySplit: 5 }]
  }

  // Ход работ: все системы на одном листе
  const progress = workbook.addWorksheet("Ход работ")
  progress.columns = [
    { header: "Маркировка", width: 12 },
    { header: "Система", width: 18 },
    { header: "Этаж", width: 12 },
    { header: "Конец трассы", width: 28 },
    ...CABLE_STAGES.map((stage) => ({ header: CABLE_STAGE_LABELS[stage], width: 26 })),
  ]
  progress.getRow(1).font = { bold: true }
  for (const line of lines) {
    progress.addRow([
      line.marking,
      SYSTEM_LABELS[line.system],
      nameById(directories.floors, line.floor),
      nameById(directories.rooms, line.room) || line.to_point,
      ...CABLE_STAGES.map((stage) =>
        line[`${stage}_at`] ? `${formatDateTime(line[`${stage}_at`])}, ${nameById(directories.users, line[`${stage}_by`])}` : "",
      ),
    ])
  }
  progress.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => (cell.border = BORDER)))
  progress.views = [{ state: "frozen", ySplit: 1 }]

  // Сохранение файла на устройство
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `Кабельный журнал ${today.toLocaleDateString("ru-RU")}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
