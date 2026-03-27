// src/App.tsx
import { RouterProvider } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { router } from './routes/routes'
import SessionActivity from './session/SessionActivity'

export default function App() {
  return (
    <>
      <SessionActivity />
      <RouterProvider router={router} />
      {import.meta.env.DEV && (
        <TanStackRouterDevtools router={router} position="bottom-right" initialIsOpen={false} />
      )}
    </>
  )
}
