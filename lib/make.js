import Settings from "@/models/Settings";

// Trimite un eveniment catre webhook-ul Make.com configurat.
// Nu blocheaza fluxul principal daca webhook-ul esueaza.
export async function dispatchToMake(event, payload) {
  try {
    const settings = await Settings.findOne();
    const url = settings?.makeWebhookUrl || process.env.MAKE_WEBHOOK_URL;
    if (!url) return; // integrarea nu este configurata

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      }),
    }).catch(() => {});
  } catch {
    // Integrarea Make este optionala — ignoram erorile
  }
}
