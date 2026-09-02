export type Bindings = {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  ENVIRONMENT?: string;
};

export type AuthUser = {
  userId: number;
  staffId: number | null;
  residentId: number | null;
  userType: "resident" | "staff" | "system";
  role: string | null;
  permissions: string[];
  displayName: string;
  email: string | null;
  username: string | null;
  sessionId: number;
};

export type AppVariables = {
  auth?: AuthUser;
  requestId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: AppVariables;
};
