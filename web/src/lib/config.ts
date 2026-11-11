// The ONLY place that reads settings from the environment.
// Every name used here must also be listed in .env.example (a test checks this).

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing setting ${name}. See .env.example.`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get faceServiceUrl() {
    return required("FACE_SERVICE_URL");
  },
  get faceServiceSecret() {
    return required("FACE_SERVICE_SECRET");
  },
  get storageDir() {
    return optional("STORAGE_DIR", "../storage");
  },
  get photoEncActiveKeyId() {
    return required("PHOTO_ENC_ACTIVE_KEY_ID");
  },
  get selfieStore() {
    return optional("SELFIE_STORE", "memory");
  },
  get imageSearchProvider() {
    return optional("IMAGE_SEARCH_PROVIDER", "mock");
  },
  get tineyeApiKey() {
    return optional("TINEYE_API_KEY", "");
  },
};
