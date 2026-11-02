import type { Api } from "../api";
import type { ErrorPayload } from "../types";

type RemindersApi = Pick<
  Api,
  | "listReminders"
  | "getDueReminders"
  | "createReminder"
  | "updateReminder"
  | "setReminderDone"
  | "deleteReminder"
>;

function notImplemented(): never {
  throw {
    kind: "Validation",
    message: "Reminders are not implemented yet.",
  } satisfies ErrorPayload;
}

export function createRemindersMock(): RemindersApi {
  return {
    listReminders: async () => [],
    getDueReminders: async () => [],
    createReminder: async () => notImplemented(),
    updateReminder: async () => notImplemented(),
    setReminderDone: async () => notImplemented(),
    deleteReminder: async () => notImplemented(),
  };
}
