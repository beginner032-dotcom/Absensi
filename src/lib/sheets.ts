const STORAGE_KEY_PESERTA = "Absensi_App_Peserta";
const STORAGE_KEY_KEHADIRAN = "Absensi_App_Kehadiran";

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxKwLf6sm3AjfOejorWjxdqkK-MFcRonQu8wYo-bHIoF8kVxhfCydb9ObvN6z4TUvwy/exec';

export async function getOrCreateSpreadsheet(): Promise<string | null> {
  const scriptUrl = localStorage.getItem("APPS_SCRIPT_URL") || DEFAULT_APPS_SCRIPT_URL;
  if (scriptUrl) {
    return "apps-script-connected";
  }

  // Fallback to local
  if (!localStorage.getItem(STORAGE_KEY_PESERTA)) {
    localStorage.setItem(STORAGE_KEY_PESERTA, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEY_KEHADIRAN)) {
    localStorage.setItem(STORAGE_KEY_KEHADIRAN, JSON.stringify([]));
  }
  return "local-DB-123";
}

export type ParticipantInfo = {
  id: string;
  name: string;
  instansi: string;
  status: string; // 'Hadir' or 'Belum'
};

type KehadiranRecord = {
  id: string;
  name: string;
  date: string;
  time: string;
};

export async function fetchSummary(
  spreadsheetId: string,
): Promise<{
  total: number;
  present: number;
  absent: number;
  percentage: number;
  participants: ParticipantInfo[];
}> {
  const scriptUrl = localStorage.getItem("APPS_SCRIPT_URL") || DEFAULT_APPS_SCRIPT_URL;
  if (scriptUrl) {
    try {
      const res = await fetch(`${scriptUrl}?action=getSummary`);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("Gagal mengambil data dari Spreadsheet", e);
      // fallback to empty
      return { total: 0, present: 0, absent: 0, percentage: 0, participants: [] };
    }
  }

  // small delay to mimic async fetch
  await new Promise((resolve) => setTimeout(resolve, 200));

  const pesertaData: ParticipantInfo[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY_PESERTA) || "[]",
  );
  const kehadiranData: KehadiranRecord[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY_KEHADIRAN) || "[]",
  );

  const kehadiranSet = new Set(kehadiranData.map((k) => k.id));

  const participants = pesertaData.map((p) => ({
    ...p,
    status: kehadiranSet.has(p.id) ? "Hadir" : "Belum",
  }));

  const total = participants.length;
  const present = participants.filter((p) => p.status === "Hadir").length;

  if (total === 0) {
    return {
      total: 0,
      present: 0,
      absent: 0,
      percentage: 0,
      participants: [],
    };
  }

  const absent = total - present;
  const percentage =
    total === 0 ? 0 : parseFloat(((present / total) * 100).toFixed(1));

  return { total, present, absent, percentage, participants };
}

export async function addParticipant(
  spreadsheetId: string,
  name: string,
  instansi: string,
) {
  const id = `P-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const scriptUrl = localStorage.getItem("APPS_SCRIPT_URL") || DEFAULT_APPS_SCRIPT_URL;
  if (scriptUrl) {
    await fetch(scriptUrl, {
      method: "POST",
      body: JSON.stringify({
        action: "addParticipant",
        data: { id, name, instansi }
      })
      // Avoid content-type header to prevent CORS preflight
    });
    return { success: true };
  }

  const pesertaData: ParticipantInfo[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY_PESERTA) || "[]",
  );
  pesertaData.push({
    id,
    name,
    instansi,
    status: "Belum",
  });

  localStorage.setItem(STORAGE_KEY_PESERTA, JSON.stringify(pesertaData));
  return { success: true };
}

export async function markAttendance(
  spreadsheetId: string,
  participantId: string,
  participantName: string,
) {
  const date = new Date().toLocaleDateString("id-ID");
  const time = new Date().toLocaleTimeString("id-ID");

  const scriptUrl = localStorage.getItem("APPS_SCRIPT_URL") || DEFAULT_APPS_SCRIPT_URL;
  if (scriptUrl) {
    const res = await fetch(scriptUrl, {
      method: "POST",
      body: JSON.stringify({
        action: "markAttendance",
        data: { id: participantId, name: participantName, date, time }
      })
    });
    const result = await res.json();
    return result;
  }

  const kehadiranData: KehadiranRecord[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY_KEHADIRAN) || "[]",
  );

  // check if already marked
  if (kehadiranData.find((k) => k.id === participantId)) {
    return { success: false, message: "Already marked present" };
  }

  kehadiranData.push({
    id: participantId,
    name: participantName,
    date,
    time,
  });

  localStorage.setItem(STORAGE_KEY_KEHADIRAN, JSON.stringify(kehadiranData));

  return { success: true };
}
