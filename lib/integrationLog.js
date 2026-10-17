import IntegrationLog from "@/models/IntegrationLog";

export async function logIntegration(entry) {
  try {
    await IntegrationLog.create(entry);
  } catch {
    /* jurnalul este optional */
  }
}
