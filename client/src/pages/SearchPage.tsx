import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import MapSelector from "../components/MapSelector";
import ProgressOverlay from "../components/ProgressOverlay";

type Mode = "town" | "map";

export default function SearchPage() {
  const navigate = useNavigate();
  const [occupation, setOccupation] = useState("electrician");
  const [town, setTown] = useState("Woking");
  const [mode, setMode] = useState<Mode>("town");
  const [center, setCenter] = useState({ lat: 51.319, lng: -0.558 }); // Woking
  const [radiusM, setRadiusM] = useState(8000);
  const [maxResults, setMaxResults] = useState(60);
  const [searching, setSearching] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    setProgressMessage("Starting search…");
    setProgressPercent(0);

    try {
      const summary = await api.searchWithProgress(
        {
          occupation,
          maxResults,
          ...(mode === "town" ? { town } : { center, radiusM }),
        },
        (p) => {
          setProgressMessage(p.message);
          setProgressPercent(p.percent);
        }
      );
      setProgressPercent(100);
      setProgressMessage(`Found ${summary.qualified} qualified lead${summary.qualified === 1 ? "" : "s"}`);
      navigate(`/admin/leads?searchRunId=${summary.searchRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="page">
      <ProgressOverlay
        visible={searching}
        title="Searching for leads"
        message={progressMessage}
        percent={progressPercent}
      />

      <h1>Find leads</h1>
      <p className="sub">Search Google for tradespeople who lack a real website.</p>

      <div className="card form">
        <label>
          Occupation
          <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. electrician" />
        </label>

        <div className="mode-toggle">
          <button className={mode === "town" ? "on" : ""} onClick={() => setMode("town")} type="button">
            By town
          </button>
          <button className={mode === "map" ? "on" : ""} onClick={() => setMode("map")} type="button">
            By map + radius
          </button>
        </div>

        {mode === "town" ? (
          <label>
            Town
            <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Woking" />
          </label>
        ) : (
          <>
            <MapSelector center={center} radiusM={radiusM} onCenterChange={setCenter} />
            <label>
              Radius: {(radiusM / 1000).toFixed(1)} km
              <input
                type="range"
                min={500}
                max={30000}
                step={500}
                value={radiusM}
                onChange={(e) => setRadiusM(Number(e.target.value))}
              />
            </label>
          </>
        )}

        <label>
          Max results
          <input type="number" min={1} max={120} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} />
        </label>

        <button className="primary" disabled={searching || !occupation} onClick={() => runSearch()}>
          {searching ? "Searching…" : "Search"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
