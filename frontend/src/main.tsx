import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import Dexie from "dexie"
import { BrowserRouter } from "react-router"
import App from "./App"
import { OLD_DATABASE_NAME } from "./lib/db"
import { startSync } from "./lib/sync"
import "./index.css"

// Прокрутку при возврате восстанавливаем сами, см. hooks/useRestoreScroll.ts.
window.history.scrollRestoration = "manual"

// Просим браузер не стирать локальную базу при нехватке места: в ней неотправленные правки.
// По адресу без HTTPS такой возможности нет.
void navigator.storage?.persist?.()

// Данные и вход от прежнего сервера (PocketBase) после переезда на Supabase не нужны.
void Dexie.delete(OLD_DATABASE_NAME)
localStorage.removeItem("pocketbase_auth")

startSync()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
