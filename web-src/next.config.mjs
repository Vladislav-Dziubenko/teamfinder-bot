/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический экспорт: `next build` кладёт готовый сайт в папку `out/`.
  // Эти файлы отдаёт твой Python-сервер из папки static/ на Render.
  output: 'export',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
