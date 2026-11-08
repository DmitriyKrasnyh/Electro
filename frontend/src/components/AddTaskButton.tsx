import { Link } from "react-router"
import { PlusIcon } from "./icons"

// Закреплена внизу экрана: так до неё проще дотянуться большим пальцем.
// Странице с этой кнопкой нужен нижний отступ pb-24, чтобы она не закрывала контент.
export function AddTaskButton({ to }: { to: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-gray-950 bg-white p-2">
      <div className="mx-auto max-w-3xl">
        <Link to={to} className="btn btn-primary w-full">
          <PlusIcon />
          Новая задача
        </Link>
      </div>
    </div>
  )
}
