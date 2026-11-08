import { errorMessage } from "../lib/format"

// Плашка внизу экрана: видна при любой прокрутке и не закрывает кнопки, которые нужно нажать снова.
// Странице нужен нижний отступ pb-36, чтобы плашка не закрывала её конец.
export function SaveErrorBanner({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      className="fixed inset-x-0 bottom-0 z-10 border-t-4 border-red-700 bg-white p-4 font-semibold text-red-800"
    >
      Не сохранено. {errorMessage(error)}
    </p>
  )
}
