import "server-only";
import { createNeonDatabase } from "./database.mjs";
import { createApi } from "./api.mjs";
let application;
export function getApplication() {
  if (!application)
    application = createNeonDatabase(process.env.DATABASE_URL)
      .then((db) =>
        createApi({ db, secureCookies: process.env.NODE_ENV === "production" }),
      )
      .catch((error) => {
        application = undefined;
        throw error;
      });
  return application;
}
