export type AppEnv = {
  Bindings: {
    DATABASE_URL: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: {
    googleUserId: string;
  };
};
