// src/routes/bibliotecario.tsx
import { Outlet } from '@tanstack/react-router'
import SidebarBibliotecario from '../components/SidebarBibliotecario'

export default function LayoutBibliotecario() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee]">
      <div className="flex min-h-screen w-full">
        {/* Lateral esquerda - sidebar */}
        <div className="shrink-0">
          <SidebarBibliotecario />
        </div>

        {/* Área de conteúdo */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
