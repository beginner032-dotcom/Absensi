import { getAccessToken } from './firebase';

const SHEET_NAME = 'Absensi_App_Data';

export async function getOrCreateSpreadsheet(): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) throw new Error('No access token');

  // Search for the file
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create if it doesn't exist
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { title: 'Peserta' } },
        { properties: { title: 'Kehadiran' } }
      ]
    })
  });

  const createData = await createRes.json();
  
  // Initialize headers
  const id = createData.spreadsheetId;
  await initSheetHeaders(id, token);
  
  return id;
}

async function initSheetHeaders(spreadsheetId: string, token: string) {
  const body = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: 'Peserta!A1:D1',
        values: [['ID', 'Nama', 'Instansi', 'Status']]
      },
      {
        range: 'Kehadiran!A1:D1',
        values: [['ID_Peserta', 'Nama', 'Tanggal', 'Waktu Hadir']]
      }
    ]
  };

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export type ParticipantInfo = {
  id: string;
  name: string;
  instansi: string;
  status: string; // 'Hadir' or 'Belum'
}

export async function fetchSummary(spreadsheetId: string): Promise<{ total: number, present: number, absent: number, percentage: number, participants: ParticipantInfo[] }> {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Peserta!A2:E&ranges=Kehadiran!A2:C`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  
  let participants: ParticipantInfo[] = [];
  const pesertaRows = data.valueRanges[0].values || [];
  const kehadiranRows = data.valueRanges[1].values || [];

  const kehadiranSet = new Set(kehadiranRows.map((row: string[]) => row[0]));

  pesertaRows.forEach((row: string[]) => {
    const id = row[0];
    const present = kehadiranSet.has(id);
    participants.push({
      id,
      name: row[1] || 'Anonim',
      instansi: row[2] || '-',
      status: present ? 'Hadir' : 'Belum'
    });
  });

  const total = participants.length;
  const present = participants.filter(p => p.status === 'Hadir').length;
  // If no attendees yet, default to some static numbers for the demo/dashboard mockup if array is empty,
  // or return actuals
  
  // MOCKUP FALLBACK: The user's image shows specific numbers (250, 162, 88). 
  // If spreadsheet is totally empty, we'll populate 10 mock entries.
  
  if (total === 0) {
     return {
         total: 0,
         present: 0,
         absent: 0,
         percentage: 0,
         participants: []
     }
  }

  const absent = total - present;
  const percentage = total === 0 ? 0 : parseFloat(((present / total) * 100).toFixed(1));

  return { total, present, absent, percentage, participants };
}

export async function addParticipant(spreadsheetId: string, name: string, instansi: string) {
  const token = await getAccessToken();
  // Generate random 6 character ID
  const id = `P-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Peserta!A:D:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [[id, name, instansi, 'Belum Hadir']]
    })
  });
  return res.json();
}

export async function markAttendance(spreadsheetId: string, participantId: string, participantName: string) {
  const token = await getAccessToken();
  const date = new Date().toLocaleDateString('id-ID');
  const time = new Date().toLocaleTimeString('id-ID');

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Kehadiran!A:D:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [[participantId, participantName, date, time]]
    })
  });
  
  // Update Status in Peserta sheet
  try {
    const pesertaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Peserta!A:A`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await pesertaRes.json();
    const rows = data.values || [];
    const index = rows.findIndex((row: string[]) => row[0] === participantId);
    
    if (index !== -1) {
      const rowNumber = index + 1; // 1-based index
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Peserta!D${rowNumber}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [['Hadir']]
        })
      });
    }
  } catch (error) {
    console.error("Failed to update status in Peserta sheet", error);
  }

  return res.json();
}
