import { useEffect } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigationType } from "react-router"
import { FirstSyncGate } from "./components/FirstSyncGate"
import { isLoggedIn, useCurrentUser } from "./lib/auth"
import CablesPage from "./pages/CablesPage"
import DirectoriesPage from "./pages/DirectoriesPage"
import DocumentPage from "./pages/DocumentPage"
import DocumentsPage from "./pages/DocumentsPage"
import GroundingPage from "./pages/GroundingPage"
import HomePage from "./pages/HomePage"
import LoginPage from "./pages/LoginPage"
import PasswordPage from "./pages/PasswordPage"
import PlanPage from "./pages/PlanPage"
import PlansPage from "./pages/PlansPage"
import SyncPage from "./pages/SyncPage"
import TaskCreatePage from "./pages/TaskCreatePage"
import TaskDetailPage from "./pages/TaskDetailPage"
import TaskEditPage from "./pages/TaskEditPage"
import TaskListPage from "./pages/TaskListPage"

// Не пускает на экраны без входа и ждёт первой загрузки данных на новом устройстве.
function RequireAuth() {
  useCurrentUser() // перерисовка при входе и выходе
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return (
    <FirstSyncGate>
      <Outlet />
    </FirstSyncGate>
  )
}

// Новый экран открываем сверху. Смена фильтров и кнопка «Назад» прокрутку не трогают.
function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0)
  }, [pathname, navigationType])

  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/systems/:system" element={<TaskListPage />} />
          <Route path="/tasks/new" element={<TaskCreatePage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
          <Route path="/directories" element={<DirectoriesPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/floors/:id/plan" element={<PlanPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/password" element={<PasswordPage />} />
          <Route path="/cables" element={<CablesPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentPage />} />
          <Route path="/grounding" element={<GroundingPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
