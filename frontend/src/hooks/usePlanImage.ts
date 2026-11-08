import { useEffect, useState } from "react"
import { savePlanImage } from "../lib/data"
import type { LocalPlan } from "../lib/db"
import { pdfToImage } from "../lib/planImage"

// Готовит адрес картинки плана. Картинка показывается как есть. PDF при первом открытии
// рисуется и сохраняется, поэтому его обработка нужна на устройстве только один раз.
export function usePlanImage(plan: LocalPlan | undefined) {
  const [url, setUrl] = useState("")
  const [failed, setFailed] = useState(false)

  // Данные с устройства перечитываются при любом изменении и приходят новыми объектами,
  // поэтому следим за строкой, которая меняется только при смене самого файла.
  const key = plan ? `${plan.floor}/${plan.fileName}/${plan.file.size}/${Boolean(plan.image)}` : ""

  useEffect(() => {
    setFailed(false)
    if (!plan) {
      setUrl("")
      return
    }

    const image = plan.image ?? (plan.file.type === "application/pdf" ? null : plan.file)
    if (image) {
      const objectUrl = URL.createObjectURL(image)
      setUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }

    setUrl("")
    let cancelled = false
    pdfToImage(plan.file)
      .then((result) => (cancelled ? undefined : savePlanImage(plan, result.image, result.pages)))
      .catch((error) => {
        console.error("Не удалось открыть PDF", error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return { url, failed }
}
