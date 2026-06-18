/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Menu,
  Bell,
  QrCode,
  Users,
  CheckCircle,
  FileText,
  UserMinus,
  Settings,
  Home,
  User,
  Scan,
  Plus,
  X,
  Search,
  Check,
  AlertTriangle,
  Download,
  ChevronRight,
  LogOut,
  Info,
  RefreshCw,
  BarChart2,
  PieChart,
  TrendingUp,
  Database,
  CheckSquare,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";
import {
  getOrCreateSpreadsheet,
  fetchSummary,
  ParticipantInfo,
  addParticipant,
  markAttendance,
} from "./lib/sheets";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import QRCode from "qrcode";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const playBeep = () => {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();

    // Suara beep yang lebih besar dan jelas untuk sukses (dua nada)
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.8, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.1);
    playTone(1760, now + 0.1, 0.2);
  } catch (e) {
    console.error("Audio error", e);
  }
};

const playErrorBeep = () => {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.error("Audio error", e);
  }
};

const QrScanner = ({
  onScanSuccess,
  onScanError,
}: {
  onScanSuccess: (text: string) => void;
  onScanError?: (msg: string) => void;
}) => {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");

  const onScanSuccessRef = useRef(onScanSuccess);
  const onScanErrorRef = useRef(onScanError);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
    onScanErrorRef.current = onScanError;
  }, [onScanSuccess, onScanError]);

  useEffect(() => {
    let isMounted = true;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (isMounted && devices && devices.length > 0) {
          setCameras(devices);
        }
      })
      .catch((err) => {
        console.error("Camera detection error:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5Qrcode("reader");
    let isScanning = false;

    const startScanner = async () => {
      try {
        const cameraConfig = selectedCameraId
          ? selectedCameraId
          : { facingMode: "environment" };
        await scanner.start(
          cameraConfig,
          { fps: 30, qrbox: { width: 250, height: 250 }, disableFlip: false },
          (decodedText) => {
            if (isMounted && onScanSuccessRef.current)
              onScanSuccessRef.current(decodedText);
          },
          () => {}, // Ignored parse errors
        );
        isScanning = true;
        if (isMounted && onScanErrorRef.current) onScanErrorRef.current("");
      } catch (err) {
        console.error("Scanner start error:", err);
        if (isMounted && onScanErrorRef.current) {
          playErrorBeep();
          onScanErrorRef.current(
            "Gagal mengakses kamera, pastikan izin telah diberikan.",
          );
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (isScanning) {
        scanner
          .stop()
          .then(() => {
            try {
              scanner.clear();
            } catch (e) {
              // Ignore DOM removal errors if React already unmounted it
            }
          })
          .catch(console.error);
      }
    };
  }, [selectedCameraId]);

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col space-y-3">
      <div
        id="reader"
        className="w-full overflow-hidden rounded-2xl bg-black min-h-[300px]"
      ></div>
      {cameras.length > 1 && (
        <select
          value={selectedCameraId}
          onChange={(e) => setSelectedCameraId(e.target.value)}
          className="w-full bg-white border border-gray-200 text-gray-800 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-3 shadow-sm outline-none"
        >
          <option value="" disabled>
            Pilih Resolusi / Kamera Lain
          </option>
          {cameras.map((cam, idx) => (
            <option key={cam.id} value={cam.id}>
              {cam.label || `Kamera ${idx + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

type SummaryData = {
  total: number;
  present: number;
  absent: number;
  percentage: number;
  participants: ParticipantInfo[];
};

const DEFAULT_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_aKE6MEZO7McVeBMPTxUFEvZp_MklHE8jPSzaxbJhvw/edit?gid=1418602897#gid=1418602897";

const generateQRImageWithText = async (p: ParticipantInfo): Promise<string> => {
  const qrDataUrl = await QRCode.toDataURL(p.id, { width: 400, margin: 2 });
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement("canvas");
      const padding = 40;
      const textTopHeight = 100;
      const textBottomHeight = 60;
      
      tempCanvas.width = img.width + padding * 2;
      tempCanvas.height = img.height + padding * 2 + textTopHeight + textBottomHeight;
      const ctx = tempCanvas.getContext("2d");
      
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw Top Text (Name and Instansi)
        ctx.fillStyle = "#111827"; 
        ctx.textAlign = "center";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(p.name, tempCanvas.width / 2, padding + 40);
        
        ctx.fillStyle = "#6b7280"; 
        ctx.font = "24px sans-serif";
        ctx.fillText(p.instansi, tempCanvas.width / 2, padding + 80);

        // Draw QR code
        ctx.drawImage(img, padding, padding + textTopHeight);
        
        // Draw Bottom Text (ID)
        ctx.fillStyle = "#374151"; 
        ctx.font = "bold 28px monospace";
        ctx.fillText(p.id, tempCanvas.width / 2, tempCanvas.height - padding - 10);

        resolve(tempCanvas.toDataURL("image/png"));
      } else {
        resolve(qrDataUrl); // Fallback to just QR code if canvas fails
      }
    };
    img.onerror = () => resolve(qrDataUrl);
    img.src = qrDataUrl;
  });
};

export default function App() {
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstansi, setNewInstansi] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHadir, setFilterHadir] = useState<"Semua" | "Hadir" | "BelumHadir">("Semua");

  const [scanResult, setScanResult] = useState<{
    id: string;
    name?: string;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const lastScannedTime = useRef<number>(0);

  const [manualId, setManualId] = useState("");
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);

  const [selectedQR, setSelectedQR] = useState<ParticipantInfo | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const sid = await getOrCreateSpreadsheet();
      if (sid) {
        setSpreadsheetId(sid);
        const data = await fetchSummary(sid);
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !spreadsheetId) return;

    try {
      setIsAdding(true);
      await addParticipant(spreadsheetId, newName, newInstansi);
      setNewName("");
      setNewInstansi("");
      setShowAddForm(false);
      await loadData();
    } catch (err) {
      console.error("Failed to add participant:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleScan = async (decodedText: string) => {
    const now = Date.now();
    // Prevent multiple scans within 3 seconds
    if (isMarking || scanResult || now - lastScannedTime.current < 3000) return;

    lastScannedTime.current = now;
    const participantId = decodedText.trim();
    const participant = summary?.participants.find(
      (p) => p.id === participantId,
    );

    if (!participant) {
      setScanError(`ID Peserta "${participantId}" tidak terdaftar.`);
      playErrorBeep();
      setTimeout(() => setScanError(null), 3000);
      return;
    }

    if (participant.status === "Hadir") {
      setScanError(`${participant.name} sudah melakukan presensi.`);
      playErrorBeep();
      setTimeout(() => setScanError(null), 3000);
      return;
    }

    try {
      if (spreadsheetId) {
        setScanResult({
          id: participantId,
          name: participant?.name || "Anonim",
        });
        playBeep();

        // Optimistic update so it feels super fast
        markAttendance(
          spreadsheetId,
          participantId,
          participant?.name || "Anonim",
        )
          .then(() => loadData())
          .catch((err) => {
            console.error("Gagal mencatat kehadiran:", err);
          });

        setTimeout(() => {
          setScanResult(null);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      setScanError("Gagal mencatat kehadiran");
      playErrorBeep();
      setTimeout(() => setScanError(null), 3000);
    }
  };

  const renderScan = () => {
    const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (manualId.trim()) {
        handleScan(manualId);
        setManualId("");
      }
    };

    return (
      <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
        <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50 flex flex-col">
          <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm z-20">
            <h1 className="text-xl font-bold">Scan QR Kehadiran</h1>
            <p className="text-gray-500 text-sm mt-1">
              Arahkan kamera ke QR Code atau masukkan ID manual
            </p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
            <div className="w-full relative">
              <QrScanner
                onScanSuccess={handleScan}
                onScanError={setCameraErrorMsg}
              />

              {isMarking && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
                </div>
              )}
            </div>

            {cameraErrorMsg && (
              <div className="w-full bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start space-x-3 text-orange-800 text-sm animate-in fade-in">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{cameraErrorMsg}</p>
              </div>
            )}

            <div className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 font-medium mb-3">
                Atau masukkan ID Peserta secara manual:
              </p>
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Contoh: P-123456"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isMarking || !manualId.trim()}
                  className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition"
                >
                  Submit
                </button>
              </form>
            </div>

            {scanResult && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm bg-green-500 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl transform transition-all scale-100 animate-in zoom-in-95">
                  <div className="bg-white p-4 rounded-full text-green-500 mb-6 shadow-sm">
                    <Check className="w-16 h-16" strokeWidth={3} />
                  </div>
                  <h3 className="font-bold text-white text-3xl mb-2">
                    Kehadiran Berhasil
                  </h3>
                  <div className="bg-green-600/50 rounded-2xl p-4 w-full mt-4">
                    <p className="text-green-50 text-sm font-medium opacity-90 uppercase tracking-widest">
                      ID Peserta
                    </p>
                    <p className="text-white text-2xl font-bold tracking-wider mb-3">
                      {scanResult.id}
                    </p>
                    {scanResult.name && (
                      <>
                        <p className="text-green-50 text-sm font-medium opacity-90 uppercase tracking-widest">
                          Nama
                        </p>
                        <p className="text-white text-xl font-bold">
                          {scanResult.name}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scanError && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-white/80 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm bg-red-500 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl transform transition-all scale-100 animate-in zoom-in-95">
                  <div className="bg-white p-4 rounded-full text-red-500 mb-6 shadow-sm">
                    <X className="w-16 h-16" strokeWidth={3} />
                  </div>
                  <h3 className="font-bold text-white text-3xl mb-2">Gagal</h3>
                  <div className="bg-red-600/50 rounded-2xl p-4 w-full mt-4">
                    <p className="text-white text-lg font-medium leading-relaxed">
                      {scanError}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPeserta = () => {
    const filteredParticipants = (summary?.participants || []).filter((p) => {
      const matchQuery = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.instansi.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchStatus = 
        filterHadir === "Semua" ? true :
        filterHadir === "Hadir" ? p.status === "Hadir" :
        p.status !== "Hadir";

      return matchQuery && matchStatus;
    });

    const handleShareWhatsApp = async (p: ParticipantInfo) => {
      const text = `Halo, ini adalah akses peserta untuk 2026 Annual Meeting.\n\nNama: ${p.name}\nInstansi: ${p.instansi}\nID Peserta: ${p.id}\n\nSilakan simpan QR Code ini dan tunjukkan saat kehadiran.`;
      
      try {
        const dataUrl = await generateQRImageWithText(p);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `QR_${p.name.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'QR Code Peserta',
            text: text,
            files: [file]
          });
          return;
        }
      } catch (err) {
        console.error("Gagal generate/share QR", err);
      }
      
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    };

    return (
      <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
        <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50">
          <div className="bg-white sticky top-0 z-20 px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <button
                  onClick={() => setActiveTab("Dashboard")}
                  className="mr-3 text-gray-800 hover:bg-gray-100 p-2 rounded-full -ml-2 md:hidden"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-xl font-bold">Daftar Peserta</h1>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2.5 transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama, ID, atau instansi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 border-none rounded-xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            
            <div className="flex space-x-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
              {(["Semua", "Hadir", "BelumHadir"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterHadir(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                    filterHadir === tab
                      ? "bg-gray-800 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {tab === "Semua" ? "Semua" : tab === "Hadir" ? "Hadir" : "Belum Hadir"}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-3">
            {loadingData && !summary ? (
              <div className="text-center py-10 text-gray-500">
                Memuat data...
              </div>
            ) : filteredParticipants.length > 0 ? (
              filteredParticipants.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-mono">
                        {p.id}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {p.instansi}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleShareWhatsApp(p)}
                        className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition shadow-sm"
                        title="Bagikan via WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedQR(p)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm"
                        title="Lihat QR Code"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <span
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold",
                          p.status === "Hadir"
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700",
                        )}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                <Users className="w-12 h-12 mb-3 opacity-20" />
                <p>Tidak ada peserta ditemukan.</p>
              </div>
            )}
          </div>
        </div>

        {/* Add Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 relative animate-in fade-in zoom-in-95 duration-200">
              <button
                onClick={() => setShowAddForm(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold mb-6">Tambah Peserta</h2>

              <form onSubmit={handleAddParticipant} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Masukkan nama"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">
                    Instansi / Organisasi
                  </label>
                  <input
                    type="text"
                    value={newInstansi}
                    onChange={(e) => setNewInstansi(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Masukkan instansi"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAdding}
                  className="w-full bg-blue-600 text-white font-bold rounded-xl py-3 mt-4 hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isAdding ? "Menyimpan..." : "Simpan Data"}
                </button>
              </form>
            </div>
          </div>
        )}
        {/* QR Code Modal */}
        {selectedQR && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
              <button
                onClick={() => setSelectedQR(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold mb-1 mt-2">QR Code Peserta</h2>
              <p className="text-gray-500 text-sm mb-6 text-center">
                {selectedQR.name} <br />
                <span className="text-xs">{selectedQR.instansi}</span>
              </p>

              <div className="bg-white p-4 rounded-xl border-2 border-gray-100 mb-6 flex items-center justify-center shadow-sm">
                <QRCodeCanvas
                  id="qr-canvas"
                  value={selectedQR.id}
                  size={250}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="bg-gray-50 px-4 py-2 rounded-lg font-mono text-gray-700 tracking-wider mb-4 border border-gray-200 font-bold">
                {selectedQR.id}
              </div>

              <button
                onClick={() => {
                  const qrCanvas = document.getElementById(
                    "qr-canvas",
                  ) as HTMLCanvasElement;
                  if (qrCanvas) {
                    const tempCanvas = document.createElement("canvas");
                    const padding = 40;
                    const textTopHeight = 100;
                    const textBottomHeight = 60;
                    
                    tempCanvas.width = qrCanvas.width + padding * 2;
                    tempCanvas.height = qrCanvas.height + padding * 2 + textTopHeight + textBottomHeight;
                    const ctx = tempCanvas.getContext("2d");
                    if (ctx) {
                      ctx.fillStyle = "#ffffff";
                      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                      
                      // Draw Top Text (Name and Instansi)
                      ctx.fillStyle = "#111827"; 
                      ctx.textAlign = "center";
                      ctx.font = "bold 24px sans-serif";
                      ctx.fillText(selectedQR.name, tempCanvas.width / 2, padding + 30);
                      
                      ctx.fillStyle = "#6b7280"; 
                      ctx.font = "16px sans-serif";
                      ctx.fillText(selectedQR.instansi, tempCanvas.width / 2, padding + 60);

                      // Draw QR code
                      ctx.drawImage(qrCanvas, padding, padding + textTopHeight);
                      
                      // Draw Bottom Text (ID)
                      ctx.fillStyle = "#374151"; 
                      ctx.font = "bold 20px monospace";
                      ctx.fillText(selectedQR.id, tempCanvas.width / 2, tempCanvas.height - padding - 10);

                      const pngUrl = tempCanvas.toDataURL("image/png");
                      const downloadLink = document.createElement("a");
                      downloadLink.href = pngUrl;
                      downloadLink.download = `QR_${selectedQR.name.replace(/\s+/g, "_")}.png`;
                      document.body.appendChild(downloadLink);
                      downloadLink.click();
                      document.body.removeChild(downloadLink);
                    }
                  }
                }}
                className="w-full flex items-center justify-center space-x-2 bg-blue-50 text-blue-700 font-bold rounded-xl py-3 mb-4 hover:bg-blue-100 transition shadow-sm border border-blue-100"
              >
                <Download className="w-5 h-5" />
                <span>Unduh QR Code</span>
              </button>

              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Tunjukkan QR Code ini kepada panitia saat registrasi, atau
                simpan layar ini.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKehadiran = () => {
    const presentParticipants = (summary?.participants || []).filter(
      (p) => p.status === "Hadir",
    );

    const handleShareWhatsApp = async (p: ParticipantInfo) => {
      const text = `Halo, terima kasih telah hadir di 2026 Annual Meeting.\n\nNama: ${p.name}\nInstansi: ${p.instansi}\nID Peserta: ${p.id}\n\nSemoga acara berjalan lancar dan bermanfaat bagi Anda.`;
      
      try {
        const dataUrl = await generateQRImageWithText(p);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `QR_${p.name.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Terima Kasih Kehadiran',
            text: text,
            files: [file]
          });
          return;
        }
      } catch (err) {
        console.error("Gagal generate/share QR", err);
      }
      
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    };

    return (
      <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
        <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50 flex flex-col">
          <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm z-20 sticky top-0">
            <div className="flex items-center mb-1">
              <button
                onClick={() => setActiveTab("Dashboard")}
                className="mr-3 text-gray-800 hover:bg-gray-100 p-2 rounded-full -ml-2 md:hidden"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold">Data Kehadiran</h1>
            </div>
            <p className="text-gray-500 text-sm pl-10 md:pl-0 lg:pl-0">
              {presentParticipants.length} Peserta telah hadir
            </p>
          </div>

          <div className="flex-1 p-4 space-y-3">
            {presentParticipants.length > 0 ? (
              presentParticipants.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-mono">
                        {p.id}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {p.instansi}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleShareWhatsApp(p)}
                        className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition shadow-sm"
                        title="Kirim pesan terima kasih via WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Hadir
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
                <p>Belum ada peserta yang hadir hari ini.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBelumHadir = () => {
    const absentParticipants = (summary?.participants || []).filter(
      (p) => p.status !== "Hadir",
    );

    const handleShareWhatsApp = async (p: ParticipantInfo) => {
      const text = `Halo, mengingatkan Anda untuk menghadiri acara 2026 Annual Meeting.\n\nNama: ${p.name}\nInstansi: ${p.instansi}\nID Peserta: ${p.id}\n\nSampai jumpa di lokasi acara.`;
      
      try {
        const dataUrl = await generateQRImageWithText(p);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `QR_${p.name.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Pengingat Kehadiran',
            text: text,
            files: [file]
          });
          return;
        }
      } catch (err) {
        console.error("Gagal generate/share QR", err);
      }
      
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    };

    return (
      <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
        <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50 flex flex-col">
          <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm z-20 sticky top-0">
            <div className="flex items-center mb-1">
              <button
                onClick={() => setActiveTab("Dashboard")}
                className="mr-3 text-gray-800 hover:bg-gray-100 p-2 rounded-full -ml-2 md:hidden"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold">Peserta Belum Hadir</h1>
            </div>
            <p className="text-gray-500 text-sm pl-10 md:pl-0 lg:pl-0">
              {absentParticipants.length} Peserta belum hadir
            </p>
          </div>

          <div className="flex-1 p-4 space-y-3">
            {absentParticipants.length > 0 ? (
              absentParticipants.map((p, idx) => (
                <div
                  key={`${p.id}-${idx}`}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900">{p.name}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-mono">
                        {p.id}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {p.instansi}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleShareWhatsApp(p)}
                        className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition shadow-sm"
                        title="Ingatkan via WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                        Belum Hadir
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
                <p>Semua peserta sudah hadir.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPengaturan = () => (
    <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
      <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50 flex flex-col">
        <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm z-20 sticky top-0">
          <div className="flex items-center mb-1">
            <button
              onClick={() => setActiveTab("Dashboard")}
              className="mr-3 text-gray-800 hover:bg-gray-100 p-2 rounded-full -ml-2 md:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold">Pengaturan</h1>
          </div>
          <p className="text-gray-500 text-sm pl-10 md:pl-0 lg:pl-0">
            Konfigurasi aplikasi dan akun
          </p>
        </div>

        <div className="flex-1 p-6 space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">
              Data & Kehadiran
            </h3>

            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="bg-purple-50 p-2 rounded-xl text-purple-600">
                  <Database className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Apps Script URL
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Integrasi Google Spreadsheet
                  </p>
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <input
                  type="text"
                  placeholder="https://script.google.com/macros/s/AKfycbxKwLf6sm3AjfOejorWjxdqkK-MFcRonQu8wYo-bHIoF8kVxhfCydb9ObvN6z4TUvwy/exec"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  defaultValue={
                    localStorage.getItem("APPS_SCRIPT_URL") ||
                    "https://script.google.com/macros/s/AKfycbxKwLf6sm3AjfOejorWjxdqkK-MFcRonQu8wYo-bHIoF8kVxhfCydb9ObvN6z4TUvwy/exec"
                  }
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value) {
                      localStorage.setItem("APPS_SCRIPT_URL", value);
                    } else {
                      localStorage.removeItem("APPS_SCRIPT_URL");
                    }
                    loadData();
                  }}
                />
                <button
                  onClick={() => {
                    const script = `// Deploy this to Google Apps Script
var SHEET_NAME_PESERTA = 'Peserta';
var SHEET_NAME_KEHADIRAN = 'Kehadiran';

function doPost(e) {
  var output = { status: 'success' };
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (payload.action === 'addParticipant') {
      var ws = sheet.getSheetByName(SHEET_NAME_PESERTA) || sheet.insertSheet(SHEET_NAME_PESERTA);
      if (ws.getLastRow() === 0) ws.appendRow(['ID', 'Nama', 'Instansi', 'Status']);
      ws.appendRow([payload.data.id, payload.data.name, payload.data.instansi, 'Belum']);
    } else if (payload.action === 'markAttendance') {
      var ws = sheet.getSheetByName(SHEET_NAME_KEHADIRAN) || sheet.insertSheet(SHEET_NAME_KEHADIRAN);
      if (ws.getLastRow() === 0) ws.appendRow(['ID_Peserta', 'Nama', 'Tanggal', 'Waktu Hadir']);
      ws.appendRow([payload.data.id, payload.data.name, payload.data.date, payload.data.time]);
      
      var pSheet = sheet.getSheetByName(SHEET_NAME_PESERTA);
      if (pSheet) {
        // Update status "Hadir" di sheet Peserta
        var dataValues = pSheet.getDataRange().getValues();
        for (var i = 1; i < dataValues.length; i++) {
          if (dataValues[i][0] === payload.data.id) {
            pSheet.getRange(i + 1, 4).setValue("Hadir");
            break;
          }
        }
      }
    }
  } catch(error) {
    output = { status: 'error', message: error.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e.parameter.action === 'getSummary') {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var pSheet = sheet.getSheetByName(SHEET_NAME_PESERTA);
    var kSheet = sheet.getSheetByName(SHEET_NAME_KEHADIRAN);
    var peserta = []; var kehadiran = [];
    if (pSheet && pSheet.getLastRow() > 1) {
      var data = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, 4).getValues();
      for(var i=0; i<data.length; i++) peserta.push({ id: data[i][0], name: data[i][1], instansi: data[i][2] });
    }
    if (kSheet && kSheet.getLastRow() > 1) {
      var data2 = kSheet.getRange(2, 1, kSheet.getLastRow() - 1, 4).getValues();
      for(var j=0; j<data2.length; j++) kehadiran.push({ id: data2[j][0] });
    }
    
    var kehadiranSet = new Set(kehadiran.map(function(k){ return k.id; }));
    var resultParticipants = peserta.map(function(p) {
       p.status = kehadiranSet.has(p.id) ? "Hadir" : "Belum";
       return p;
    });
    
    var present = resultParticipants.filter(function(p){ return p.status === "Hadir"; }).length;
    var total = resultParticipants.length;
    
    return ContentService.createTextOutput(JSON.stringify({
      total: total, present: present, absent: total - present,
      percentage: total === 0 ? 0 : parseFloat(((present/total)*100).toFixed(1)),
      participants: resultParticipants
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput("OK");
}`;
                    navigator.clipboard.writeText(script);
                    alert(
                      "Kode Apps Script berhasil disalin! Buka Extensions > Apps Script di Spreadsheet Anda, paste kode ini, lalu Deploy sebagai Web App.",
                    );
                  }}
                  className="text-xs font-semibold text-purple-600 bg-purple-50 rounded-lg py-2 hover:bg-purple-100 transition-colors"
                >
                  Salin Kode Apps Script
                </button>
              </div>

              <div className="flex flex-col space-y-2 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-3 mb-1">
                  <div className="bg-green-50 p-2 rounded-xl text-green-600">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-semibold text-gray-900 text-sm">
                      Google Spreadsheet URL
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      URL Spreadsheet Anda (opsional)
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                  defaultValue={
                    localStorage.getItem("SPREADSHEET_URL") ||
                    DEFAULT_SPREADSHEET_URL ||
                    ""
                  }
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value) {
                      localStorage.setItem("SPREADSHEET_URL", value);
                    } else {
                      localStorage.removeItem("SPREADSHEET_URL");
                    }
                  }}
                />
              </div>
            </div>

            <button
              onClick={() => {
                const sheetUrl =
                  localStorage.getItem("SPREADSHEET_URL") ||
                  DEFAULT_SPREADSHEET_URL;
                if (sheetUrl) {
                  window.open(sheetUrl, "_blank");
                } else if (
                  spreadsheetId &&
                  spreadsheetId !== "apps-script-connected"
                ) {
                  window.open(
                    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                    "_blank",
                  );
                } else {
                  alert(
                    "Spreadsheet belum tersedia. Silakan isi Google Spreadsheet URL di pengaturan.",
                  );
                }
              }}
              className="w-full bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-green-50 p-2 rounded-xl text-green-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Buka Spreadsheet
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Lihat data langsung di Google Sheets
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">
              Lainnya
            </h3>

            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-gray-50 p-2 rounded-xl text-gray-600">
                  <Info className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 text-sm">
                    Versi Aplikasi
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">v1.0.0</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (
                  confirm(
                    "Reset seluruh data aplikasi? Ini tidak bisa dikembalikan.",
                  )
                ) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="w-full bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm flex items-center justify-center space-x-2 text-red-600 hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-semibold text-sm">
                Reset Data (Log Out)
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLaporan = () => {
    const presentCount = summary?.present || 0;
    const absentCount = summary?.absent || 0;
    const totalCount = summary?.total || 0;
    const attendancePercentage = summary?.percentage || 0;

    return (
      <div className="font-sans text-gray-900 bg-gray-50 min-h-full pb-6">
        <div className="max-w-md md:max-w-none mx-auto w-full relative bg-gray-50 flex flex-col">
          <div className="bg-white px-6 pt-6 pb-4 border-b border-gray-100 shadow-sm z-20 sticky top-0">
            <div className="flex items-center mb-1">
              <button
                onClick={() => setActiveTab("Dashboard")}
                className="mr-3 text-gray-800 hover:bg-gray-100 p-2 rounded-full -ml-2 md:hidden"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold">Laporan Kehadiran</h1>
            </div>
            <p className="text-gray-500 text-sm pl-10 md:pl-0 lg:pl-0">
              Ringkasan data hari ini
            </p>
          </div>

          <div className="flex-1 p-6 space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-gray-500 mb-1">
                  Total Peserta
                </h3>
                <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-green-50 p-2.5 rounded-xl text-green-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-gray-500 mb-1">
                  Tingkat Hadir
                </h3>
                <p className="text-2xl font-bold text-green-600">
                  {attendancePercentage}%
                </p>
              </div>
            </div>

            {/* Attendance Bar Chart / Progress */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-gray-400" />
                  Status Kehadiran
                </h3>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                      Hadir
                    </span>
                    <span className="font-bold text-gray-900">
                      {presentCount}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${totalCount > 0 ? (presentCount / totalCount) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
                      Belum Hadir
                    </span>
                    <span className="font-bold text-gray-900">
                      {absentCount}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-orange-500 h-3 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${totalCount > 0 ? (absentCount / totalCount) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
              Aksi Laporan
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => {
                  const sheetUrl =
                    localStorage.getItem("SPREADSHEET_URL") ||
                    DEFAULT_SPREADSHEET_URL;
                  if (sheetUrl) {
                    window.open(sheetUrl, "_blank");
                  } else if (
                    spreadsheetId &&
                    spreadsheetId !== "apps-script-connected"
                  ) {
                    window.open(
                      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                      "_blank",
                    );
                  } else {
                    alert(
                      "Spreadsheet belum tersedia. Silakan isi Google Spreadsheet URL di pengaturan.",
                    );
                  }
                }}
                className="w-full bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-purple-50 p-3 rounded-xl text-purple-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">
                      Download Rekap
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Buka spreadsheet untuk export PDF/Excel
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="font-sans text-gray-900 bg-white min-h-full pb-4 flex flex-col">
      {/* Target mobile width for desktop preview */}
      <div className="max-w-md md:max-w-none mx-auto w-full relative flex-1 flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-2">
            <Menu className="w-6 h-6 text-gray-800 md:hidden" />
            <div className="hidden md:block w-6"></div>{" "}
            {/* Spacer for desktop so title remains centered */}
            <h1 className="text-xl font-bold">Dashboard</h1>
            <div className="relative">
              <button
                onClick={() => window.location.reload()}
                className="p-2 -mr-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Meeting Info */}
          <div className="px-5 mb-3 mt-1">
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              2026 Annual Meeting
            </h2>
            <p className="text-gray-500 text-xs mt-0.5 font-medium">
              Hotel Nusatu
            </p>
          </div>
        </div>

        {/* Ringkasan Kehadiran */}
        <div className="px-5 mb-5 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base text-gray-900 tracking-tight">
              Ringkasan Kehadiran
            </h3>
            <button
              className="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors"
              onClick={loadData}
            >
              Lihat Semua
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
            {/* Total Peserta */}
            <div
              className="bg-[#4285F4] text-white rounded-2xl p-3 flex flex-col items-center text-center shadow-sm cursor-pointer hover:bg-opacity-90 transition-colors"
              onClick={() => setActiveTab("Peserta")}
            >
              <div className="w-8 h-8 flex items-center justify-center border border-white/30 rounded-lg mb-2">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium leading-tight mb-1 opacity-90">
                Total Peserta
              </span>
              <span className="text-xl sm:text-2xl font-bold tracking-tight">
                {loadingData ? "..." : (summary?.total ?? 0)}
              </span>
              <span className="text-[9px] opacity-80 font-medium">Orang</span>
            </div>

            {/* Sudah Hadir */}
            <div
              className="bg-[#34A853] text-white rounded-2xl p-3 flex flex-col items-center text-center shadow-sm cursor-pointer hover:bg-opacity-90 transition-colors"
              onClick={() => setActiveTab("Kehadiran")}
            >
              <div className="w-8 h-8 flex items-center justify-center border border-white/30 rounded-lg mb-2">
                <CheckCircle className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium leading-tight mb-1 opacity-90">
                Sudah Hadir
              </span>
              <span className="text-xl sm:text-2xl font-bold tracking-tight">
                {loadingData ? "..." : (summary?.present ?? 0)}
              </span>
              <span className="text-[9px] opacity-80 font-medium">Orang</span>
            </div>

            {/* Belum Hadir */}
            <div
              className="bg-[#FBBC05] text-white rounded-2xl p-3 flex flex-col items-center text-center shadow-sm cursor-pointer hover:bg-opacity-90 transition-colors"
              onClick={() => setActiveTab("BelumHadir")}
            >
              <div className="w-8 h-8 flex items-center justify-center border border-white/30 rounded-lg mb-2">
                <User className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium leading-tight mb-1 opacity-90">
                Belum Hadir
              </span>
              <span className="text-xl sm:text-2xl font-bold tracking-tight">
                {loadingData ? "..." : (summary?.absent ?? 0)}
              </span>
              <span className="text-[9px] opacity-80 font-medium">Orang</span>
            </div>

            {/* Persentase */}
            <div className="bg-[#9333EA] text-white rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
              <div className="w-8 h-8 flex items-center justify-center border border-white/30 rounded-lg mb-2">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <span className="text-[10px] font-medium leading-tight mb-1 opacity-90">
                Persentase
              </span>
              <span className="text-xl sm:text-2xl font-bold tracking-tight">
                {loadingData ? "..." : `${summary?.percentage ?? 0}%`}
              </span>
              <span className="text-[9px] opacity-80 font-medium mt-0.5">
                Kehadiran
              </span>
            </div>
          </div>
        </div>

        {/* Menu Cepat */}
        <div className="flex-1 px-5 pb-6">
          <h3 className="font-bold text-base text-gray-900 tracking-tight mb-3">
            Menu Cepat
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => setActiveTab("Scan")}
            >
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-3 text-blue-600">
                <QrCode className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800">
                Scan QR
              </span>
            </button>

            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => setActiveTab("Peserta")}
            >
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-3 text-green-600">
                <Users className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800 text-center leading-tight">
                Daftar Peserta
              </span>
            </button>

            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => setActiveTab("Kehadiran")}
            >
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-3 text-orange-500">
                <CheckCircle className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800">
                Kehadiran
              </span>
            </button>

            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => {
                const sheetUrl =
                  localStorage.getItem("SPREADSHEET_URL") ||
                  DEFAULT_SPREADSHEET_URL;
                if (sheetUrl) {
                  window.open(sheetUrl, "_blank");
                } else if (
                  spreadsheetId &&
                  spreadsheetId !== "apps-script-connected"
                ) {
                  window.open(
                    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
                    "_blank",
                  );
                } else {
                  alert(
                    "Spreadsheet belum tersedia. Silakan isi Google Spreadsheet URL di pengaturan.",
                  );
                }
              }}
            >
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-3 text-purple-600">
                <FileText className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800">
                Spreadsheet
              </span>
            </button>

            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => setActiveTab("BelumHadir")}
            >
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-3 text-orange-500">
                <UserMinus className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800 text-center leading-tight">
                Belum Hadir
              </span>
            </button>

            <button
              className="flex flex-col items-center bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] sm:aspect-square md:aspect-[4/3] justify-center"
              onClick={() => setActiveTab("Pengaturan")}
            >
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3 text-gray-600">
                <Settings className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-gray-800">
                Pengaturan
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex bg-gray-100 md:bg-[#1A1C1E] h-[100dvh] w-full overflow-hidden text-gray-900 relative">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-64 lg:w-72 h-full border-r border-gray-800">
        <div className="flex items-center space-x-3 px-8 py-8 border-b border-gray-800/50">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl text-white tracking-tight">
            HadirApp
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-8 scrollbar-hide">
          <nav className="space-y-1">
            {[
              { id: "Dashboard", label: "Dashboard", icon: Home },
              { id: "Scan", label: "Scan QR", icon: Scan },
              { id: "Peserta", label: "Daftar Peserta", icon: Users },
              { id: "Kehadiran", label: "Sudah Hadir", icon: CheckSquare },
              { id: "BelumHadir", label: "Belum Hadir", icon: UserMinus },
              { id: "Laporan", label: "Laporan", icon: FileText },
              { id: "Pengaturan", label: "Pengaturan", icon: Settings },
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center space-x-4 px-4 py-4 rounded-2xl transition-all duration-200 font-medium group",
                    active
                      ? "bg-blue-600/10 text-blue-500"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200",
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      active
                        ? "text-blue-500"
                        : "text-gray-500 group-hover:text-gray-300",
                    )}
                  />
                  <span className={cn(active && "font-bold")}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full md:flex-1 relative shadow-2xl overflow-hidden flex flex-col h-full bg-white md:bg-gray-50 md:rounded-l-[2.5rem] md:my-3 md:border md:border-gray-200/50">
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide md:p-6 lg:p-10">
          <div className="md:max-w-6xl md:mx-auto">
            {activeTab === "Dashboard" && renderDashboard()}
            {activeTab === "Peserta" && renderPeserta()}
            {activeTab === "Scan" && renderScan()}
            {activeTab === "Kehadiran" && renderKehadiran()}
            {activeTab === "BelumHadir" && renderBelumHadir()}
            {activeTab === "Laporan" && renderLaporan()}
            {activeTab === "Pengaturan" && renderPengaturan()}
          </div>
        </div>

        {/* Bottom Nav Mobile */}
        <div className="md:hidden bg-white border-t border-gray-100 py-2 px-4 flex justify-between items-center z-10 w-full shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => setActiveTab("Dashboard")}
            className={cn(
              "flex flex-col items-center p-1 w-16",
              activeTab === "Dashboard" ? "text-blue-600" : "text-gray-400",
            )}
          >
            <Home
              className={cn(
                "w-6 h-6 mb-1",
                activeTab === "Dashboard" && "fill-blue-600",
              )}
            />
            <span className="text-[10px] font-semibold">Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("Scan")}
            className={cn(
              "flex flex-col items-center p-1 w-16",
              activeTab === "Scan" ? "text-blue-600" : "text-gray-400",
            )}
          >
            <Scan className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Scan</span>
          </button>

          <button
            onClick={() => setActiveTab("Peserta")}
            className={cn(
              "flex flex-col items-center p-1 w-16",
              activeTab === "Peserta" ? "text-blue-600" : "text-gray-400",
            )}
          >
            <Users className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Peserta</span>
          </button>

          <button
            onClick={() => setActiveTab("Laporan")}
            className={cn(
              "flex flex-col items-center p-1 w-16",
              activeTab === "Laporan" ? "text-blue-600" : "text-gray-400",
            )}
          >
            <FileText className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Laporan</span>
          </button>

          <button
            onClick={() => setActiveTab("Pengaturan")}
            className={cn(
              "flex flex-col items-center p-1 w-16",
              activeTab === "Pengaturan" ? "text-blue-600" : "text-gray-400",
            )}
          >
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-medium">Pengaturan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
