// Копия библиотеки для фонового потока, чтобы экран не подвисал во время сжатия.
// По умолчанию библиотека скачивает её с внешнего сервера, а в подвале интернета нет.
import workerLibUrl from "browser-image-compression/dist/browser-image-compression.js?url"

// Уменьшает фото перед сохранением: примерно до 500 КБ, не больше 1920 px по длинной стороне.
// Если фоновый поток не запустится, библиотека сама выполнит сжатие в основном потоке.
export async function compressPhoto(file: File): Promise<File> {
  // Библиотека нужна только здесь, поэтому загружаем её при первом сжатии, а не при запуске.
  const { default: imageCompression } = await import("browser-image-compression")
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1920,
    // Ради размера файла снижаем качество, а не разрешение: иначе на снимках
    // перестанут читаться мелкие надписи на кабелях и щитах.
    alwaysKeepResolution: true,
    initialQuality: 0.8,
    fileType: "image/jpeg",
    useWebWorker: true,
    libURL: new URL(workerLibUrl, location.origin).href,
  })
  // Имя с понятным расширением: исходные имена с телефона бывают любыми.
  return new File([compressed], "photo.jpg", { type: compressed.type })
}
