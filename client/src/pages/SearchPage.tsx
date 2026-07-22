import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import MapSelector from "../components/MapSelector";
import ProgressOverlay from "../components/ProgressOverlay";
import type { SearchMode } from "../types";

type PlaceMode = "town" | "map";

export default function SearchPage() {
  const navigate = useNavigate();
  const [occupation, setOccupation] = useState("plumber");
  const [town, setTown] = useState("Woking");
  const [placeMode, setPlaceMode] = useState<PlaceMode>("town");
  const [searchMode, setSearchMode] = useState<SearchMode>("SAAS_BETA");
  const [center, setCenter] = useState({ lat: 51.319, lng: -0.558 }); // Woking
  const [radiusM, setRadiusM] = useState(8000);
  const [maxResults, setMaxResults] = useState(30);
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
          mode: searchMode,
          ...(placeMode === "town" ? { town } : { center, radiusM }),
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

  const isBeta = searchMode === "SAAS_BETA";

  return (
    <div className="page">
      <ProgressOverlay
        visible={searching}
        title={isBeta ? "Searching for beta candidates" : "Searching for leads"}
        message={progressMessage}
        percent={progressPercent}
      />

      <h1>Find leads</h1>
      <p className="sub">
        {isBeta
          ? "Find established UK trades with a real web presence — good candidates for TradiesMate beta."
          : "Search Google for tradespeople who lack a real website (demo-site pitch)."}
      </p>

      <div className="card form">
        <div className="mode-toggle" role="group" aria-label="Search purpose">
          <button
            className={searchMode === "SAAS_BETA" ? "on" : ""}
            onClick={() => setSearchMode("SAAS_BETA")}
            type="button"
          >
            SaaS beta
          </button>
          <button
            className={searchMode === "SITE_BUILD" ? "on" : ""}
            onClick={() => setSearchMode("SITE_BUILD")}
            type="button"
          >
            Site build
          </button>
        </div>
        <p className="muted-text" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>
          {isBeta
            ? "Qualifies live websites (and busy social profiles) with enough Google reviews. Skips domain checks."
            : "Qualifies businesses with no proper website. Scores domain availability for the site pitch."}
        </p>

        <label>
          Occupation
          <input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. plumber" />
        </label>

        <div className="mode-toggle">
          <button className={placeMode === "town" ? "on" : ""} onClick={() => setPlaceMode("town")} type="button">
            By town
          </button>
          <button className={placeMode === "map" ? "on" : ""} onClick={() => setPlaceMode("map")} type="button">
            By map + radius
          </button>
        </div>

        {placeMode === "town" ? (
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
          <input
            type="number"
            min={1}
            max={120}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
          />
        </label>

        <button className="primary" disabled={searching || !occupation} onClick={() => runSearch()}>
          {searching ? "Searching…" : "Search"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
