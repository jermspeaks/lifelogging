import type { Api } from "../api";
import type { ErrorPayload } from "../types";

type GoalsApi = Pick<
  Api,
  | "listGoals"
  | "createGoal"
  | "updateGoal"
  | "setGoalStatus"
  | "deleteGoal"
  | "reorderGoals"
  | "logGoalProgress"
>;

function notImplemented(): never {
  throw { kind: "Validation", message: "Goals are not implemented yet." } satisfies ErrorPayload;
}

export function createGoalsMock(): GoalsApi {
  return {
    listGoals: async () => [],
    createGoal: async () => notImplemented(),
    updateGoal: async () => notImplemented(),
    setGoalStatus: async () => notImplemented(),
    deleteGoal: async () => notImplemented(),
    reorderGoals: async () => notImplemented(),
    logGoalProgress: async () => notImplemented(),
  };
}
