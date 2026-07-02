import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CalendarDays,
  Database,
  FileUp,
  Gauge,
  MapPinned,
  Plane,
  Radar,
  RefreshCw,
  ShieldCheck,
  ThermometerSun,
  UploadCloud,
  Wind,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

const TIME_RANGE_OPTIONS = [
  { label: "All data", value: "all" },
  { label: "Past 7 days", value: "7" },
  { label: "Past 14 days", value: "14" },
  { label: "Past 30 days", value: "30" },
  { label: "Past 1 month", value: "30" },
  { label: "Past 3 months", value: "90" },
  { label: "Custom days", value: "custom" },
];

const SENSOR_OPTIONS = [
  { label: "All MQ sensors", value: "all" },
  { label: "MQ135 only", value: "mq135" },
  { label: "MQ2 only", value: "mq2" },
  { label: "MQ7 only", value: "mq7" },
];

function getCutoffTime(readings, timeRange, customDays) {
  if (timeRange === "all" || !readings.length) return null;

  const days = timeRange === "custom" ? Number(customDays || 1) : Number(timeRange);
  const latestTimestamp = Math.max(...readings.map((item) => new Date(item.timestamp).getTime()));

  return latestTimestamp - days * 24 * 60 * 60 * 1000;
}

function filterReadingsByTimeRange(readings, timeRange, customDays) {
  const cutoff = getCutoffTime(readings, timeRange, customDays);
  if (!cutoff) return readings;

  return readings.filter((item) => new Date(item.timestamp).getTime() >= cutoff);
}

function filterMissionsByTimeRange(missions, cutoff) {
  if (!cutoff) return missions;

  return missions.filter((mission) => {
    const missionTime = new Date(mission.started_at).getTime();
    return missionTime >= cutoff;
  });
}

function useDashboardData(selectedMission) {
  const [state, setState] = useState({
    overview: null,
    missions: [],
    charts: { readings: [], missions: [] },
    prediction: null,
    loading: true,
    error: "",
  });

  const load = async () => {
    try {
      const query = selectedMission === "all" ? "all" : selectedMission;
      const [overview, missions, charts, prediction] = await Promise.all([
        fetch(`${API}/overview`).then((r) => r.json()),
        fetch(`${API}/missions`).then((r) => r.json()),
        fetch(`${API}/charts?mission_id=${query}`).then((r) => r.json()),
        fetch(`${API}/prediction?mission_id=${query}`).then((r) => r.json()),
      ]);

      setState({ overview, missions, charts, prediction, loading: false, error: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, [selectedMission]);

  return { ...state, reload: load };
}

function compactTime(value) {
  if (!value) return "No data";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function riskColor(risk) {
  if (risk === "Danger") return "text-red-700 bg-red-50 border-red-200";
  if (risk === "Warning") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}

function StatCard({ icon: Icon, label, value, sublabel, tone = "text-teal-600" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,118,110,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {sublabel && <p className="mt-1 text-sm text-slate-500">{sublabel}</p>}
        </div>
        <div className={`rounded-md border border-slate-200 bg-slate-50 p-2 ${tone}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,118,110,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="shrink-0 text-teal-600" size={20} />}
          <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ImportControls({ reload }) {
  const [status, setStatus] = useState("");

  const scan = async () => {
    setStatus("Scanning mission folder...");
    const res = await fetch(`${API}/import/scan`, { method: "POST" });
    const data = await res.json();
    const imported = data.results.filter((item) => item.status === "imported").length;
    const duplicate = data.results.filter((item) => item.status === "duplicate").length;
    setStatus(`${imported} imported, ${duplicate} duplicates skipped`);
    reload();
  };

  const generate = async () => {
    setStatus("Generating sample missions...");
    await fetch(`${API}/generate-samples`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 10 }),
    });
    await scan();
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.append("file", file);
    setStatus(`Importing ${file.name}...`);

    const res = await fetch(`${API}/import/upload`, { method: "POST", body });
    const data = await res.json();

    setStatus(data.status === "duplicate" ? "Duplicate mission skipped" : `${file.name} imported`);
    reload();
    event.target.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-teal-50"
        onClick={scan}
        title="Scan mission folder"
      >
        <RefreshCw size={18} />
      </button>

      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-medium text-teal-800 shadow-sm hover:bg-teal-100"
        onClick={generate}
      >
        <Radar size={18} />
        Samples
      </button>

      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-medium text-teal-800 shadow-sm hover:bg-teal-100">
        <UploadCloud size={18} />
        Upload CSV
        <input className="hidden" type="file" accept=".csv" onChange={upload} />
      </label>

      {status && <span className="min-w-0 text-sm text-slate-500">{status}</span>}
    </div>
  );
}

function MissionSelector({ missions, selected, setSelected }) {
  return (
    <div className="flex min-w-[230px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <Database size={17} className="text-slate-500" />
      <select
        className="w-full bg-transparent text-sm text-slate-800 outline-none"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="all">All missions combined</option>
        {missions.map((mission) => (
          <option key={mission.id} value={mission.id}>
            Mission {mission.id} - {mission.filename}
          </option>
        ))}
      </select>
    </div>
  );
}

function TimeRangeSelector({ value, setValue, customDays, setCustomDays }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <CalendarDays size={17} className="text-slate-500" />

      <select
        className="bg-transparent text-sm text-slate-800 outline-none"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        {TIME_RANGE_OPTIONS.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {value === "custom" && (
        <input
          className="w-20 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-800 outline-none"
          type="number"
          min="1"
          value={customDays}
          onChange={(event) => setCustomDays(event.target.value)}
          placeholder="Days"
        />
      )}
    </div>
  );
}

function SensorSelector({ value, setValue }) {
  return (
    <select
      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    >
      {SENSOR_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function GasMap({ readings }) {
  const points = readings.slice(-450);
  const center = points.length ? [points[0].latitude, points[0].longitude] : [12.9716, 77.5946];
  const highest = points.reduce((top, point) => (point.concentration > (top?.concentration || 0) ? point : top), null);

  return (
    <div className="h-[420px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points.map((point, index) => {
          const isPeak = highest && point.id === highest.id;
          const radius = Math.max(4, Math.min(22, point.concentration / 42));
          const color = point.risk_level === "Danger" ? "#dc2626" : point.risk_level === "Warning" ? "#d97706" : "#059669";

          return (
            <CircleMarker
              key={`${point.timestamp}-${index}`}
              center={[point.latitude, point.longitude]}
              radius={isPeak ? radius + 5 : radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isPeak ? 0.6 : 0.28,
                weight: isPeak ? 3 : 1,
              }}
            >
              <Popup>
                <strong>{isPeak ? "Highest point" : "Sensor reading"}</strong>
                <br />
                {number(point.concentration, 1)} ppm
                <br />
                {compactTime(point.timestamp)}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function App() {
  const [selectedMission, setSelectedMission] = useState("all");
  const [timeRange, setTimeRange] = useState("all");
  const [customDays, setCustomDays] = useState("10");
  const [selectedSensor, setSelectedSensor] = useState("all");

  const { overview, missions, charts, prediction, loading, error, reload } = useDashboardData(selectedMission);
  const readings = charts.readings || [];
  const allMissionTrend = charts.missions || [];

  const cutoff = useMemo(
    () => getCutoffTime(readings, timeRange, customDays),
    [readings, timeRange, customDays]
  );

  const chartReadings = useMemo(
    () => filterReadingsByTimeRange(readings, timeRange, customDays),
    [readings, timeRange, customDays]
  );

  const missionTrend = useMemo(
    () => filterMissionsByTimeRange(allMissionTrend, cutoff),
    [allMissionTrend, cutoff]
  );

  const risk = overview?.risk_level || "Safe";

  return (
    <main className="min-h-screen bg-[#eef7f5] text-slate-900">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-teal-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg border border-teal-200 bg-white p-3 text-teal-700 shadow-sm">
              <Plane size={30} />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                AI Drone Gas Detection Command Center
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Mission imports, historical gas analytics, prediction-ready signals, and mapped plume zones.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <MissionSelector missions={missions} selected={selectedMission} setSelected={setSelectedMission} />
            <TimeRangeSelector
              value={timeRange}
              setValue={setTimeRange}
              customDays={customDays}
              setCustomDays={setCustomDays}
            />
            <ImportControls reload={reload} />
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-slate-500">
            Loading mission telemetry...
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard icon={Plane} label="Missions" value={number(overview?.total_missions)} sublabel="completed imports" />
          <StatCard icon={Activity} label="Readings" value={number(overview?.total_readings)} sublabel="stored in SQLite" />
          <StatCard icon={Gauge} label="Peak Gas" value={`${number(overview?.highest_gas_concentration, 1)} ppm`} sublabel="highest sensor value" tone="text-red-600" />
          <StatCard icon={Wind} label="Average Gas" value={`${number(overview?.average_gas_concentration, 1)} ppm`} sublabel="mission average" tone="text-sky-600" />
          <StatCard icon={ThermometerSun} label="Latest Mission" value={compactTime(overview?.latest_mission_timestamp)} sublabel="last timestamp" tone="text-amber-600" />

          <div className={`rounded-lg border p-4 shadow-[0_14px_35px_rgba(15,118,110,0.08)] ${riskColor(risk)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] opacity-75">Risk Level</p>
                <p className="mt-2 text-2xl font-semibold">{risk}</p>
                <p className="mt-1 text-sm opacity-75">Safe, Warning, Danger</p>
              </div>
              {risk === "Danger" ? <AlertTriangle size={26} /> : <ShieldCheck size={26} />}
            </div>
          </div>
        </section>

        <div className="rounded-lg border border-teal-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          Showing <span className="font-semibold text-slate-900">{number(chartReadings.length)}</span> readings for{" "}
          <span className="font-semibold text-teal-700">
            {TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label || "selected range"}
          </span>
          . Date filters are calculated from the latest available reading in the selected mission data.
        </div>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <Panel title="Gas Concentration vs Time" icon={Activity}>
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartReadings}>
                  <defs>
                    <linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0e9f8a" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0e9f8a" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#dbe7e5" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={compactTime} minTickGap={30} stroke="#607481" />
                  <YAxis stroke="#607481" />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid #dbe7e5", color: "#17323a" }}
                    labelFormatter={compactTime}
                  />
                  <Area type="monotone" dataKey="concentration" stroke="#0e9f8a" fill="url(#gasFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="AI Prediction Panel" icon={BrainCircuit}>
            <div className="grid gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Predicted gas type</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {prediction?.predicted_gas || "Awaiting mission data"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Confidence</p>
                  <p className="mt-2 text-2xl font-semibold text-teal-700">
                    {number((prediction?.confidence || 0) * 100, 1)}%
                  </p>
                </div>

                <div className={`rounded-lg border p-4 ${riskColor(prediction?.risk_level || "Safe")}`}>
                  <p className="text-sm opacity-75">Category</p>
                  <p className="mt-2 text-2xl font-semibold">{prediction?.risk_level || "Safe"}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                The panel currently uses rule-based sample inference from MQ sensor dominance. The API response shape is stable for replacing this with a trained ML model later.
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="MQ Sensor Analysis"
            icon={Gauge}
            action={<SensorSelector value={selectedSensor} setValue={setSelectedSensor} />}
          >
            <div className="h-[315px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartReadings}>
                  <CartesianGrid stroke="#dbe7e5" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={compactTime} minTickGap={32} stroke="#607481" />
                  <YAxis stroke="#607481" />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid #dbe7e5", color: "#17323a" }}
                    labelFormatter={compactTime}
                  />
                  <Legend />

                  {(selectedSensor === "all" || selectedSensor === "mq135") && (
                    <Line type="monotone" dataKey="mq135" stroke="#0284c7" dot={false} strokeWidth={2} />
                  )}

                  {(selectedSensor === "all" || selectedSensor === "mq2") && (
                    <Line type="monotone" dataKey="mq2" stroke="#d97706" dot={false} strokeWidth={2} />
                  )}

                  {(selectedSensor === "all" || selectedSensor === "mq7") && (
                    <Line type="monotone" dataKey="mq7" stroke="#dc2626" dot={false} strokeWidth={2} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Temperature and Humidity Trends" icon={ThermometerSun}>
            <div className="h-[315px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartReadings}>
                  <CartesianGrid stroke="#dbe7e5" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={compactTime} minTickGap={32} stroke="#607481" />
                  <YAxis stroke="#607481" />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid #dbe7e5", color: "#17323a" }}
                    labelFormatter={compactTime}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="temperature" stroke="#d97706" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="humidity" stroke="#2563eb" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <Panel title="Historical Trend Across Missions" icon={Database}>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={missionTrend}>
                  <CartesianGrid stroke="#dbe7e5" strokeDasharray="3 3" />
                  <XAxis dataKey="id" stroke="#607481" />
                  <YAxis stroke="#607481" />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dbe7e5", color: "#17323a" }} />
                  <Legend />
                  <Bar dataKey="avg_concentration" name="Average" fill="#0e9f8a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="max_concentration" name="Peak" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Mission Comparison" icon={FileUp}>
            <div className="max-h-[340px] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mission</th>
                    <th className="px-3 py-2 font-medium">Readings</th>
                    <th className="px-3 py-2 font-medium">Average</th>
                    <th className="px-3 py-2 font-medium">Peak</th>
                    <th className="px-3 py-2 font-medium">Prediction</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                  </tr>
                </thead>

                <tbody>
                  {missionTrend.map((mission) => (
                    <tr key={mission.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 text-slate-900">
                        #{mission.id} {mission.filename}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{number(mission.reading_count)}</td>
                      <td className="px-3 py-3 text-slate-500">{number(mission.avg_concentration, 1)}</td>
                      <td className="px-3 py-3 text-slate-500">{number(mission.max_concentration, 1)}</td>
                      <td className="px-3 py-3 text-slate-500">{mission.predicted_gas}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-md border px-2 py-1 text-xs ${riskColor(mission.risk_level)}`}>
                          {mission.risk_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <Panel title="Map Visualization: Sensor Locations and Heat Zones" icon={MapPinned}>
          <GasMap readings={chartReadings} />
        </Panel>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);