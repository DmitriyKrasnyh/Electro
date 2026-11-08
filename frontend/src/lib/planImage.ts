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

// Рисует первую страницу PDF в картинку. Страницы плана считаются одним листом:
// точки задач привязаны к нему в процентах.
export async function pdfToImage(file: Blob): Promise<{ image: Blob; pages: number }> {
  // Библиотека большая, поэтому загружаем её только когда нужно нарисовать план.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loading = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await loading.promise
    const page = await pdf.getPage(1)
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
        if (image) return { image, pages: pdf.numPages }
      } catch (error) {
        console.warn(`План не нарисовался в размере ${size}`, error)
      } finally {
        canvas.width = 0 // сразу освобождаем память
      }
    }
    throw new Error("Не удалось нарисовать план")
  } finally {
    await loading.destroy()
  }
}
