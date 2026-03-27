// server/src/server.ts
import { app } from './app'
import { ENV } from './env'

app.listen(ENV.PORT, () => {
  console.log(`API a correr em http://localhost:${ENV.PORT}`)
})
