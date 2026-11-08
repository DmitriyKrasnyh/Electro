import { useLocation, useNavigate } from "react-router"

// Шаг назад с сохранением фильтров в списке. Если страницу открыли по прямой
// ссылке, истории нет (key === "default"), поэтому идём на запасной адрес.
export function useGoBack(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()

  return () => {
    if (location.key === "default") {
      navigate(fallback, { replace: true })
    } else {
      navigate(-1)
    }
  }
}
