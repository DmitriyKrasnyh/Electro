import { useLayoutEffect } from "react"
import { useLocation } from "react-router"

// Позиции прокрутки по записям истории браузера.
const positions = new Map<string, number>()

// Возвращает прокрутку при возврате на экран кнопкой «Назад». Браузер сам этого сделать
// не может: в момент возврата данных на экране ещё нет, и страница слишком короткая.
// ready: данные уже показаны, страница получила свою высоту.
export function useRestoreScroll(ready: boolean): void {
  const { key } = useLocation()

  // Запоминаем при уходе с экрана, до того как он исчезнет.
  useLayoutEffect(() => {
    return () => {
      positions.set(key, window.scrollY)
    }
  }, [key])

  useLayoutEffect(() => {
    const position = positions.get(key)
    if (ready && position) window.scrollTo(0, position)
  }, [ready, key])
}
