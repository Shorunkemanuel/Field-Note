import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { saveLocalCapture } from "../api/localCaptures";
import type { CaptureLocation, LocalCaptureEvidence } from "../types";

function EvidencePreview({ evidence, onRemove }: { evidence: LocalCaptureEvidence; onRemove?: () => void }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(evidence.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [evidence.blob]);

  return (
    <article className="capture-evidence">
      {evidence.type === "PHOTO" && url ? (
        <img src={url} alt={`Preview: ${evidence.name}`} />
      ) : evidence.type === "AUDIO" && url ? (
        <audio controls src={url}>Your browser cannot play this audio recording.</audio>
      ) : null}
      <div className="capture-evidence-meta">
        <span className="record-type">{evidence.type}</span>
        <span>{evidence.name}</span>
        {onRemove && <button className="text-button" type="button" onClick={onRemove}>Remove</button>}
      </div>
    </article>
  );
}

export default function CaptureObservationPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [textNote, setTextNote] = useState("");
  const [evidence, setEvidence] = useState<LocalCaptureEvidence[]>([]);
  const [location, setLocation] = useState<CaptureLocation | null>(null);
  const [recording, setRecording] = useState(false);
  const [microphonePending, setMicrophonePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    const invalidFile = selected.find((file) => !file.type.startsWith("image/"));
    if (invalidFile) {
      setError(`${invalidFile.name} is not an image.`);
      return;
    }
    const capturedAt = new Date().toISOString();
    setEvidence((current) => [
      ...current,
      ...selected.map((file) => ({
        id: crypto.randomUUID(),
        type: "PHOTO" as const,
        name: file.name || `Photo ${current.length + 1}`,
        mime_type: file.type,
        created_at: capturedAt,
        blob: file,
      })),
    ]);
    setError("");
  }

  async function startRecording() {
    setError("");
    setMicrophonePending(true);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported by this browser.");
      setMicrophonePending(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (activeRef.current && blob.size > 0) {
          setEvidence((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              type: "AUDIO",
              name: `Voice recording ${current.filter((item) => item.type === "AUDIO").length + 1}`,
              mime_type: mimeType,
              created_at: new Date().toISOString(),
              blob,
            },
          ]);
        }
        if (activeRef.current) setRecording(false);
      };
      recorder.start();
      setMicrophonePending(false);
      setRecording(true);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (activeRef.current) {
        setMicrophonePending(false);
        setError(reason instanceof Error ? `Microphone unavailable: ${reason.message}` : "Microphone access was not available.");
      }
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function requestLocation() {
    setError("");
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!activeRef.current) return;
        setLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
        setLocationMessage("Location added to this field note.");
      },
      (reason) => {
        if (activeRef.current) setLocationMessage(`Location not added: ${reason.message}`);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Enter a short title before saving.");
      return;
    }
    if (recording) {
      setError("Stop the voice recording before saving.");
      return;
    }
    setSaving(true);
    setError("");
    const capture = {
      id: crypto.randomUUID(),
      title: title.trim(),
      text_note: textNote.trim(),
      status: "DRAFT" as const,
      created_at: new Date().toISOString(),
      location,
      evidence,
    };
    try {
      await saveLocalCapture(capture);
      if (activeRef.current) navigate(`/observations/${capture.id}`);
    } catch (reason) {
      if (activeRef.current) {
        setError(reason instanceof Error ? `Could not save this field note locally: ${reason.message}` : "Could not save this field note locally.");
        setSaving(false);
      }
    }
  }

  return (
    <main className="page narrow-page">
      <Link className="back-link" to="/">← All observations</Link>
      <section className="form-intro">
        <p className="eyebrow">Offline-first field capture</p>
        <h1>Record what you observe</h1>
        <p>Captures are saved on this device. Add evidence now; the note remains available when offline.</p>
      </section>
      <form className="form-card capture-form" onSubmit={handleSubmit}>
        <label htmlFor="capture-title">Short title</label>
        <input
          id="capture-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder="e.g. Water pooling near west entrance"
          required
          autoFocus
        />
        <label htmlFor="capture-note">Field note <span className="optional">(optional)</span></label>
        <textarea
          id="capture-note"
          value={textNote}
          onChange={(event) => setTextNote(event.target.value)}
          rows={4}
          placeholder="Describe what you saw and any useful context."
        />

        <fieldset className="capture-controls">
          <legend>Evidence</legend>
          <label className="button button-quiet capture-file-button">
            Take or choose photos
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                addPhotos(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {recording ? (
            <button className="button button-quiet" type="button" onClick={stopRecording}>Stop voice recording</button>
          ) : (
            <button className="button button-quiet" type="button" onClick={startRecording} disabled={microphonePending}>
              {microphonePending ? "Requesting microphone…" : "Record voice note"}
            </button>
          )}
          <button className="button button-quiet" type="button" onClick={requestLocation}>
            {location ? "Refresh location" : "Add location"}
          </button>
          {location && (
            <button className="text-button" type="button" onClick={() => { setLocation(null); setLocationMessage("Location removed."); }}>
              Remove location
            </button>
          )}
          {recording && <p className="recording-indicator" role="status">Recording audio…</p>}
          {locationMessage && <p className="form-hint" role="status">{locationMessage}</p>}
        </fieldset>

        {evidence.length > 0 && (
          <section className="capture-preview" aria-label="Evidence preview">
            <h2>Evidence preview ({evidence.length})</h2>
            {evidence.map((item) => (
              <EvidencePreview
                key={item.id}
                evidence={item}
                onRemove={() => setEvidence((current) => current.filter(({ id }) => id !== item.id))}
              />
            ))}
          </section>
        )}

        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <p className="form-hint">Photos, audio, notes, and location stay in this browser's IndexedDB; nothing is uploaded.</p>
        <div className="form-actions">
          <Link className="button button-quiet" to="/">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={saving || recording}>
            {saving ? "Saving…" : "Save field note"}
          </button>
        </div>
      </form>
    </main>
  );
}
