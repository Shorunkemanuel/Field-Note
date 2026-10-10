import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { observationsApi } from "../api/client";
import { listLocalCaptures } from "../api/localCaptures";
import StatusBadge from "../components/StatusBadge";
import type { LocalCapture, Observation } from "../types";

export default function ObservationsPage() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [apiError, setApiError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([observationsApi.list(), listLocalCaptures()]).then(([remote, local]) => {
      if (remote.status === "fulfilled") setObservations(remote.value);
      else setApiError(remote.reason instanceof Error ? remote.reason.message : "Could not load saved observations.");
      if (local.status === "fulfilled") setCaptures(local.value);
      else setStorageError(local.reason instanceof Error ? local.reason.message : "Could not load local field notes.");
      setLoading(false);
    });
  }, []);

  const count = observations.length + captures.length;
  const entries = [
    ...captures.map((capture) => ({ capture, created_at: capture.created_at })),
    ...observations.map((observation) => ({ observation, created_at: observation.created_at })),
  ].sort((left, right) => right.created_at.localeCompare(left.created_at));

  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">Your field log</p>
        <h1>Observations</h1>
        <p className="intro-copy">
          Capture what you see on site. Keep the evidence and next steps connected.
        </p>
        <div className="intro-actions">
          <Link className="button button-primary" to="/capture">＋ Capture field note</Link>
          <Link className="button button-quiet" to="/observations/new">New M1 observation</Link>
        </div>
      </section>

      <section className="list-section" aria-labelledby="recent-heading">
        <div className="section-heading">
          <h2 id="recent-heading">Recent observations</h2>
          {!loading && <span className="count">{count}</span>}
        </div>
        {apiError && <p className="notice notice-warning" role="status">Server observations are unavailable: {apiError}</p>}
        {storageError && <p className="notice notice-error" role="alert">Local field notes could not be loaded: {storageError}</p>}
        {loading ? (
          <p className="quiet">Loading observations…</p>
        ) : count === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">◉</span>
            <h3>{apiError ? "Server observations are unavailable" : "Nothing recorded yet"}</h3>
            <p>{apiError ? "Saved browser captures, if any, appear here when local storage is available." : "Your field notes will show up here."}</p>
          </div>
        ) : (
          <div className="observation-list">
            {entries.map((entry) => "capture" in entry ? (
              <Link className="observation-card" key={entry.capture.id} to={`/observations/${entry.capture.id}`}>
                <div className="card-topline">
                  <StatusBadge status={entry.capture.status} />
                  <time dateTime={entry.capture.created_at}>{new Date(entry.capture.created_at).toLocaleString()}</time>
                </div>
                <h3>{entry.capture.title}</h3>
                <p>{entry.capture.text_note || "No note added."}</p>
                <span className="card-meta">
                  {entry.capture.evidence.length} evidence item{entry.capture.evidence.length === 1 ? "" : "s"} · Saved on this device
                </span>
              </Link>
            ) : (
              <Link className="observation-card" key={entry.observation.id} to={`/observations/${entry.observation.id}`}>
                <div className="card-topline">
                  <StatusBadge status={entry.observation.status} />
                  <time dateTime={entry.observation.created_at}>{new Date(entry.observation.created_at).toLocaleString()}</time>
                </div>
                <h3>{entry.observation.title}</h3>
                <p>{entry.observation.text_note || "No note added."}</p>
                <span className="card-meta">Open observation <span aria-hidden="true">→</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
