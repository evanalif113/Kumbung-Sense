"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { fetchSensorData, deleteSensorData } from "@/lib/fetchSensorData";
import { fetchActuatorLogs, ActuatorLog, deleteActuatorLogs } from "@/lib/fetchActuatorLog";
import AppHeader from "@/components/AppHeader";
import Sidebar from "@/components/Sidebar";
import {
  TemperatureIcon,
  HumidityIcon,
  LightIntensityIcon,
  MoistureIcon,
} from "@/components/Icon";
import { Trash2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { cn } from "@/lib/utils";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Period {
  label: string;
  valueInMinutes: number;
}

interface SensorDatum {
  timestamp: number;
  temperature: number;
  humidity: number;
  light: number;
  moisture: number;
  timeFormatted?: string;
}

const periods: Period[] = [
  { label: "30 Menit", valueInMinutes: 30 },
  { label: "1 Jam", valueInMinutes: 60 },
  { label: "3 Jam", valueInMinutes: 3 * 60 },
  { label: "6 Jam", valueInMinutes: 6 * 60 },
  { label: "12 Jam", valueInMinutes: 12 * 60 },
  { label: "24 Jam", valueInMinutes: 24 * 60 },
  { label: "3 Hari", valueInMinutes: 3 * 24 * 60 },
  { label: "7 Hari", valueInMinutes: 7 * 24 * 60 },
];

export default function DataHistory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("Grafik Sensor");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(periods[1]);
  const [sensorData, setSensorData] = useState<SensorDatum[]>([]);
  const [sensorLoading, setSensorLoading] = useState(true);
  const [actuatorLogs, setActuatorLogs] = useState<ActuatorLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false); // State untuk proses hapus log
  const [isDeletingSensor, setIsDeletingSensor] = useState(false); // State untuk proses hapus sensor
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(10);

  const actuatorNames: { [key: number]: string } = {
    16: "Fan",
    17: "Humidifier",
    18: "Light",
  };

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      setError(null);
      if (activeTab === "Grafik Sensor") {
        setSensorLoading(true);
        try {
          const result = await fetchSensorData(user.uid, selectedPeriod.valueInMinutes);
          setSensorData(result);
        } catch (err) {
          console.error(err);
          setError("Gagal memuat data sensor");
        } finally {
          setSensorLoading(false);
        }
      } else if (activeTab === "Log Aktuator") {
        setLogsLoading(true);
        try {
          const result = await fetchActuatorLogs(user.uid);
          setActuatorLogs(result);
        } catch (err) {
          console.error(err);
          setError("Gagal memuat log aktuator");
        } finally {
          setLogsLoading(false);
        }
      }
    };

    loadData();
  }, [user, activeTab, selectedPeriod]);

  useEffect(() => {
    if (!user || !selectedPeriod) return;

    if (selectedPeriod?.label === "30 Menit") {
      const interval = setInterval(async () => {
        try {
          const result = await fetchSensorData(user.uid, selectedPeriod.valueInMinutes);
          setSensorData(result);
        } catch (err) {
          console.error("Gagal melakukan polling data:", err);
        }
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [user, selectedPeriod]);

  const handleDeleteSensorData = async () => {
    if (!user) return;

    if (window.confirm("Apakah Anda yakin ingin menghapus semua riwayat data sensor? Tindakan ini tidak dapat diurungkan.")) {
      setIsDeletingSensor(true);
      setError(null);
      try {
        await deleteSensorData(user.uid);
        setSensorData([]); // Kosongkan state di UI setelah berhasil
      } catch (err) {
        console.error(err);
        setError("Gagal menghapus data sensor.");
      } finally {
        setIsDeletingSensor(false);
      }
    }
  };

  const handleDeleteLogs = async () => {
    if (!user) return;

    if (window.confirm("Apakah Anda yakin ingin menghapus semua riwayat log? Tindakan ini tidak dapat diurungkan.")) {
      setIsDeleting(true);
      setError(null);
      try {
        await deleteActuatorLogs(user.uid);
        setActuatorLogs([]); // Kosongkan state di UI setelah berhasil
      } catch (err) {
        console.error(err);
        setError("Gagal menghapus log aktuator.");
      } finally {
        setIsDeleting(false);
      }
    }
  };

  function getYAxisDomain(data: SensorDatum[], key: keyof SensorDatum) {
    const vals = data.map((d) => d[key] as number);
    if (vals.length === 0) return [-1, 1];
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
        min = min - 1;
        max = max + 1;
    } else {
        const padding = (max - min) * 0.1;
        min = min - padding;
        max = max + padding;
    }
    return [min, max];
  }

  const ChartCard = ({ title, dataKey, color, Icon, unit, chartData }: { title: string; dataKey: keyof SensorDatum; color: string; Icon: React.FC; unit: string; chartData: SensorDatum[] }) => {
    const yDomain = getYAxisDomain(chartData, dataKey);
    
    const chronologicalData = [...chartData].reverse();

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center">
                <Icon />
                <h3 className={`text-sm font-medium ml-2`} style={{ color }}>{title}</h3>
            </div>
            <div className="p-4">
                <Plot
                    data={[{
                        x: chronologicalData.map((d) => d.timeFormatted ? d.timeFormatted : new Date(d.timestamp).toLocaleString("id-ID")),
                        y: chronologicalData.map((d) => d[dataKey] as number),
                        type: "scatter",
                        mode: "lines+markers",
                        marker: { color },
                        line: { color, width: 3 },
                        name: title,
                    }]}
                    layout={{
                        autosize: true,
                        height: 220,
                        margin: { l: 40, r: 10, t: 10, b: 40 },
                        xaxis: { title: "Waktu", tickmode: "auto", nticks: 8, showgrid: true, zeroline: false },
                        yaxis: { title: unit, range: yDomain, showgrid: true, zeroline: false },
                        plot_bgcolor: "transparent",
                        paper_bgcolor: "transparent",
                        font: { size: 12 },
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    style={{ width: "100%", height: "220px" }}
                    useResizeHandler
                />
            </div>
        </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar/>
        <div className="flex-1 flex flex-col">
          <AppHeader />
          <main className="flex-1 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Riwayat Data</h2>
            </div>

            {/* Navigasi Tab */}
            <div className="flex space-x-2 border-b mb-6">
              <button
                onClick={() => setActiveTab("Grafik Sensor")}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === "Grafik Sensor"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Grafik Sensor
              </button>
              <button
                onClick={() => {
                  setActiveTab("Log Aktuator");
                  setCurrentPage(1); // Reset ke halaman pertama saat tab diubah
                }}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === "Log Aktuator"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Log Aktuator
              </button>
            </div>

            {error && <div className="text-center text-red-500 py-8">{error}</div>}

            {/* Konten Tab Grafik Sensor */}
            {activeTab === "Grafik Sensor" && (
              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {periods.map((period) => (
                        <button
                          key={period.label}
                          onClick={() => setSelectedPeriod(period)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedPeriod?.label === period.label
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                          }`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {sensorLoading ? (
                  <div className="text-center py-8"><LoadingSpinner /></div>
                ) : sensorData.length === 0 ? (
                  <div className="text-center text-gray-500 py-10 bg-white rounded-lg border">
                    <p>Tidak ada riwayat data sensor.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-8">
                      <ChartCard title="Suhu Udara" dataKey="temperature" color="#ef4444" Icon={TemperatureIcon} unit="°C" chartData={sensorData} />
                      <ChartCard title="Kelembapan Udara" dataKey="humidity" color="#3b82f6" Icon={HumidityIcon} unit="%" chartData={sensorData} />
                      <ChartCard title="Intensitas Cahaya" dataKey="light" color="#f59e0b" Icon={LightIntensityIcon} unit="lux" chartData={sensorData} />
                      <ChartCard title="Kelembapan Media" dataKey="moisture" color="#10b981" Icon={MoistureIcon} unit="%" chartData={sensorData} />
                    </div>
                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleDeleteSensorData}
                        disabled={sensorLoading || isDeletingSensor || sensorData.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                        {isDeletingSensor ? "Menghapus..." : "Hapus Semua Data"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Konten Tab Log Aktuator */}
            {activeTab === "Log Aktuator" && (
              <div>
                {logsLoading ? (
                  <div className="text-center py-8"><LoadingSpinner /></div>
                ) : actuatorLogs.length === 0 ? (
                  <div className="text-center text-gray-500 py-10 bg-white rounded-lg border">
                    <p>Tidak ada riwayat log aktuator.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Waktu</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Aktuator</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Mode</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {actuatorLogs
                            .slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage)
                            .map((log) => (
                            <tr key={log.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(log.timestamp).toLocaleString('id-ID')}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{actuatorNames[log.pinId] || log.pinId}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={cn("px-2 inline-flex text-xs leading-5 font-semibold rounded-full", log.state === 0 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200")}>
                                  {log.state === 0 ? 'ON' : 'OFF'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{log.mode}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Navigasi Tabel */}
                    <div className="mt-4 flex justify-between items-center">
                      <div>
                        <span className="text-sm text-gray-700">
                          Halaman <span className="font-medium">{currentPage}</span> dari <span className="font-medium">{Math.ceil(actuatorLogs.length / logsPerPage)}</span>
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Sebelumnya
                        </button>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(actuatorLogs.length / logsPerPage)))}
                          disabled={currentPage === Math.ceil(actuatorLogs.length / logsPerPage)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg border hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleDeleteLogs}
                        disabled={logsLoading || isDeleting || actuatorLogs.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                        {isDeleting ? "Menghapus..." : "Hapus Semua Log"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}