/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический экспорт: `next build` кладёт готовый сайт в папку `out/`.
  // Эти файлы отдаёт твой Python-сервер из папки static/ на Render.
  output: 'export',
  trailingSlash: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Render free: build-машина ~512 MB RAM. Один воркер без тредов —
  // не даём `next build` разгонять параллельные процессы до OOM.
  experimental: {
    cpus: 1,
    workerThreads: false,
    memoryBasedWorkersCount: false,
  },
}

export default nextConfig
