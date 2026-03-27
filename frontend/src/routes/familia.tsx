// src/routes/familia.tsx
import { Outlet } from '@tanstack/react-router'
import HeaderFamilia from '../components/HeaderFamilia'
export default function LayoutFamilia() {
  return (
    <div>
  <HeaderFamilia/>
      <Outlet />
    </div>
  )
}
