import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  // Обработчик PDF и библиотека Excel большие, но загружаются отдельно и только когда нужны:
  // при открытии плана и при выгрузке кабельного журнала.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    tailwindcss(),
    // Service worker появляется только в сборке (npm run build), в npm run dev его нет.
    VitePWA({
      registerType: "autoUpdate", // новая версия подхватывается при следующем открытии
      includeManifestIcons: false, // значки и так попадают в кэш через globPatterns
      manifest: {
        id: "/",
        name: "Электромонтаж",
        short_name: "Электромонтаж",
        description: "Задачи, статусы и фото бригады электромонтажников",
        lang: "ru",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f3f4f6",
        theme_color: "#030712",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Кэш интерфейса: всё, что нужно для запуска приложения без сети.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png}"],
        navigateFallback: "/index.html",
        // Кэш фото: уже просмотренные снимки открываются и без связи.
        // Файлы планов сюда не попадают, они хранятся в локальной базе (см. lib/sync.ts).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/storage/v1/object/sign/photos/"),
            handler: "CacheFirst",
            options: {
              cacheName: "photos",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
              plugins: [
                {
                  // Подпись в адресе со временем меняется, а файл тот же. Без этого
                  // каждая новая подпись означала бы новую запись в кэше и новое скачивание.
                  cacheKeyWillBeUsed: async ({ request }) => {
                    const url = new URL(request.url)
                    url.searchParams.delete("token")
                    return url.href
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
})
