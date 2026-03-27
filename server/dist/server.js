"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/server.ts
const app_1 = require("./app");
const env_1 = require("./env");
app_1.app.listen(env_1.ENV.PORT, () => {
    console.log(`API a correr em http://localhost:${env_1.ENV.PORT}`);
});
