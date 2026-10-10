import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { observationsApi } from "../api/client";
import { getLocalCapture } from "../api/localCaptures";
import StatusBadge from "../components/StatusBadge";
import type { LocalCapture, LocalCaptureEvidence, Observation } from "../types";

function LocalEvidence({ item }: { item: LocalCaptureEvidence }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.blob]);

  return (
    <article className="saved-evidence-card">
      {item.type === "PHOTO" && url ? (
        <img src={url} alt={`Captured evidence: ${item.name}`} />
      ) : item.type === "AUDIO" && url ? (
        <audio controls src={url}>Your browser cannot play this audio recording.</audio>
      ) : null}
      <div className="card-topline">
        <span className="record-type">{item.type}</span>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
      </div>
      <p>{item.name}</p>
    </article>
  );
}

export default function ObservationDetailPage() {
  const { id = "" } = useParams();
  const [observation, setObservation] = useState<Observation | null>(null);
  const [localCapture, setLocalCapture] = useState<LocalCapture | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setObservation(null);
    setLocalCapture(null);
    setError("");
    async function load() {
      let localReadError: unknown;
      try {
        const capture = await getLocalCapture(id);
        if (!active) return;
        if (capture) {
          setLocalCapture(capture);
          return;
        }
      } catch (reason) {
        localReadError = reason;
      }
      try {
        setObservation(await observationsApi.get(id));
      } catch (reason) {
        if (active) {
          const failure = localReadError ?? reason;
          setError(failure instanceof Error ? failure.message : "Could not load observation.");
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [id]);

  if (error) {
    return <main className="page"><Link className="back-link" to="/">← All observations</Link><p className="notice notice-error" role="alert">{error}</p></main>;
  }
  if (localCapture) {
    return (
      <main className="page narrow-page">
        <Link className="back-link" to="/">← All observations</Link>
        <article className="detail-card">
          <div className="detail-topline">
            <StatusBadge status={localCapture.status} />
            <time dateTime={localCapture.created_at}>{new Date(localCapture.created_at).toLocaleString()}</time>
          </div>
          <h1>{localCapture.title}</h1>
          <p className="detail-note">{localCapture.text_note || "No note added."}</p>
          {localCapture.location && (
            <p className="local-location">
              Location recorded with permission: {localCapture.location.latitude.toFixed(5)}, {localCapture.location.longitude.toFixed(5)}
              {" "}(±{Math.round(localCapture.location.accuracy)} m)
            </p>
          )}
          <p className="local-storage-label">Stored on this device · Not uploaded</p>
        </article>
        <section className="detail-section">
          <div className="section-heading"><h2>Evidence</h2><span className="count">{localCapture.evidence.length}</span></div>
          {localCapture.evidence.length === 0 ? (
            <p className="quiet">No evidence attached.</p>
          ) : (
            <div className="saved-evidence-list">
              {localCapture.evidence.map((item) => <LocalEvidence key={item.id} item={item} />)}
            </div>
          )}
        </section>
      </main>
    );
  }

  if (!observation) {
    return <main className="page"><p className="quiet">Loading observation…</p></main>;
  }

  return (
    <main className="page narrow-page">
      <Link className="back-link" to="/">← All observations</Link>
      <article className="detail-card">
        <div className="detail-topline">
          <StatusBadge status={observation.status} />
          <time dateTime={observation.created_at}>{new Date(observation.created_at).toLocaleString()}</time>
        </div>
        <h1>{observation.title}</h1>
        <p className="detail-note">{observation.text_note || "No note added."}</p>
      </article>

      <section className="detail-section">
        <div className="section-heading"><h2>Evidence</h2><span className="count">{observation.evidence.length}</span></div>
        {observation.evidence.length === 0 ? (
          <p className="quiet">No evidence attached yet.</p>
        ) : (
          <div className="record-list">
            {observation.evidence.map((item) => (
              <div className="record-card" key={item.id}>
                <span className="record-type">{item.type}</span>
                <div><strong>{item.uri}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="section-heading"><h2>Findings</h2><span className="count">{observation.findings.length}</span></div>
        {observation.findings.length === 0 ? (
          <p className="quiet">No findings recorded yet.</p>
        ) : (
          <div className="record-list">
            {observation.findings.map((item) => (
              <article className="finding-card" key={item.id}>
                <div className="card-topline"><span className="record-type">{item.category}</span><span className={`status-badge status-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></div>
                <h3>{item.issue}</h3>
                <p>{item.observation}</p>
                <p><strong>Suggested action:</strong> {item.suggested_action}</p>
                {item.confidence !== null && <span className="quiet">Confidence: {Math.round(item.confidence * 100)}%</span>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
