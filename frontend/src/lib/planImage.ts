// Обработчик PDF работает в фоновом потоке. Берём сборку для старых браузеров:
// на телефонах бригады может стоять не самая новая версия Chrome.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"

// Размер картинки по длинной стороне. Чем больше, тем чётче при увеличении, но тем больше
// нужно памяти. Если телефону не хватит памяти на большую, пробуем меньшую.
const SIZES = [4096, 2048]
const MAX_PNG_SIZE = 10 * 1024 * 1024

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Открытый PDF: число страниц и рисование любой страницы в картинку.
// Нужен и планам этажей, и просмотру документов. После работы обязательно close().
export interface OpenPdf {
  pages: number
  renderPage: (pageNumber: number) => Promise<Blob>
  close: () => Promise<void>
}

export async function openPdf(file: Blob): Promise<OpenPdf> {
  // Библиотека большая, поэтому загружаем её только когда нужно нарисовать PDF.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loading = pdfjs.getDocument({ data: await file.arrayBuffer() })
  // Файл не открылся (например, повреждён): освобождаем обработчик и сообщаем об ошибке.
  const pdf = await loading.promise.catch(async (error: unknown) => {
    await loading.destroy()
    throw error
  })

  async function renderPage(pageNumber: number): Promise<Blob> {
    const page = await pdf.getPage(pageNumber)
    const original = page.getViewport({ scale: 1 })

    for (const size of SIZES) {
      const viewport = page.getViewport({ scale: size / Math.max(original.width, original.height) })
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      try {
        await page.render({ canvas, viewport }).promise
        // Линии чертежа чётче всего в PNG. А вот скан в PNG занимает слишком много места.
        let image = await canvasToBlob(canvas, "image/png")
        if (image && image.size > MAX_PNG_SIZE) image = await canvasToBlob(canvas, "image/jpeg", 0.85)
        if (image) return image
      } catch (error) {
        console.warn(`Страница PDF не нарисовалась в размере ${size}`, error)
      } finally {
        canvas.width = 0 // сразу освобождаем память
      }
    }
    throw new Error("Не удалось нарисовать страницу PDF")
  }

  return { pages: pdf.numPages, renderPage, close: () => loading.destroy() }
}

// Рисует первую страницу PDF в картинку. Страницы плана считаются одним листом:
// точки задач привязаны к нему в процентах.
export async function pdfToImage(file: Blob): Promise<{ image: Blob; pages: number }> {
  const pdf = await openPdf(file)
  try {
    return { image: await pdf.renderPage(1), pages: pdf.pages }
  } finally {
    await pdf.close()
  }
}
