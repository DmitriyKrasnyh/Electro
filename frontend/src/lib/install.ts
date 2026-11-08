import { useEffect, useState } from "react"

// Установка приложения на экран телефона. Браузер сообщает о такой возможности один раз
// и рано, поэтому слушаем событие сразу при загрузке, а не при открытии экрана.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let installEvent: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function setInstallEvent(event: InstallPromptEvent | null) {
  installEvent = event
  listeners.forEach((listener) => listener())
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault() // не показываем системную подсказку, кнопка есть на главной
  setInstallEvent(event as InstallPromptEvent)
})
window.addEventListener("appinstalled", () => setInstallEvent(null))

// Возвращает функцию установки или null, если браузер её сейчас не предлагает.
export function useInstallPrompt(): (() => void) | null {
  const [, redraw] = useState(0)
  useEffect(() => {
    const listener = () => redraw((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  if (!installEvent) return null
  const event = installEvent
  return () => {
    void event.prompt()
    setInstallEvent(null) // повторно этим событием воспользоваться нельзя
  }
}
