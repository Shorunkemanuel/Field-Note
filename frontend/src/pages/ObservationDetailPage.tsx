import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { extractionsApi, observationsApi } from "../api/client";
import { getLocalCapture, saveLocalExtraction } from "../api/localCaptures";
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
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");

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

  async function analyzeCapture() {
    if (!localCapture || extracting) return;
    setExtracting(true);
    setExtractionError("");
    try {
      const extraction = await extractionsApi.create(localCapture);
      if (extraction.capture_id !== localCapture.id) {
        throw new Error("The extraction response did not match this field note.");
      }
      const updated = await saveLocalExtraction(localCapture.id, extraction);
      setLocalCapture(updated);
    } catch (reason) {
      const message =
        typeof reason === "object" &&
        reason !== null &&
        "message" in reason &&
        typeof reason.message === "string"
          ? reason.message
          : "Could not analyze this field note.";
      setExtractionError(
        message,
      );
    } finally {
      setExtracting(false);
    }
  }

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
          <p className="local-storage-label">Original capture stays on this device</p>
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
        <section className="detail-section ai-extraction-section" aria-labelledby="ai-drafts-heading">
          <div className="section-heading">
            <h2 id="ai-drafts-heading">AI-assisted draft findings</h2>
            <span className="draft-label">Not verified</span>
          </div>
          <p className="ai-disclosure">
            Analysis sends this note, its selected media, capture time, and location if present
            to the AI provider configured for this server.
          </p>
          {!localCapture.text_note.trim() && localCapture.evidence.length === 0 && (
            <p className="quiet">Add a field note or evidence before requesting an AI draft.</p>
          )}
          {extractionError && (
            <p className="notice notice-error" role="alert">
              {extractionError}
              {localCapture.ai_extraction && " The previous draft was kept."}
            </p>
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void analyzeCapture()}
            disabled={
              extracting ||
              (!localCapture.text_note.trim() && localCapture.evidence.length === 0)
            }
          >
            {extracting
              ? "Analyzing evidence…"
              : localCapture.ai_extraction
                ? "Analyze again"
                : "Analyze with AI"}
          </button>
          {extracting && <p className="quiet" role="status">Preparing a structured draft from this saved capture…</p>}
          {localCapture.ai_extraction && (
            <div className="ai-extraction-results" aria-live="polite">
              <p className="ai-model-meta">
                Draft from {localCapture.ai_extraction.provider} · {localCapture.ai_extraction.model}
              </p>
              {localCapture.ai_extraction.findings.length === 0 ? (
                <p className="quiet">No draft findings were generated from this evidence.</p>
              ) : (
                localCapture.ai_extraction.findings.map((finding, index) => (
                  <article className="finding-card ai-draft-card" key={`${index}-${finding.title}`}>
                    <div className="card-topline">
                      <span className="record-type">{finding.category}</span>
                      <span className="draft-label">AI draft · not verified</span>
                    </div>
                    <h3>{finding.title}</h3>
                    <p>{finding.description}</p>
                    <p><strong>Reasoning:</strong> {finding.reasoning}</p>
                    <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>
                    {finding.confidence !== null && (
                      <p><strong>Model confidence:</strong> {Math.round(finding.confidence * 100)}%</p>
                    )}
                    {finding.supporting_evidence.length > 0 && (
                      <p>
                        <strong>Supporting evidence:</strong>{" "}
                        {finding.supporting_evidence.map((evidenceId) => (
                          localCapture.evidence.find((item) => item.id === evidenceId)?.name ?? evidenceId
                        )).join(", ")}
                      </p>
                    )}
                    {finding.suggested_actions.length > 0 && (
                      <div>
                        <strong>Suggested next steps — not actions taken</strong>
                        <ul>
                          {finding.suggested_actions.map((action, actionIndex) => (
                            <li key={`${actionIndex}-${action.title}`}>
                              <strong>{action.title}:</strong> {action.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {finding.safety_concerns.length > 0 && (
                      <div className="safety-concerns">
                        <strong>Potential safety concerns</strong>
                        <ul>{finding.safety_concerns.map((concern) => <li key={concern}>{concern}</li>)}</ul>
                      </div>
                    )}
                  </article>
                ))
              )}
              {localCapture.ai_extraction.limitations.length > 0 && (
                <div className="extraction-limitations">
                  <strong>Evidence limitations</strong>
                  <ul>{localCapture.ai_extraction.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                </div>
              )}
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
