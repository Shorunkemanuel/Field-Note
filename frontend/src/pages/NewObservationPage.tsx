import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { observationsApi } from "../api/client";

export default function NewObservationPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [textNote, setTextNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const observation = await observationsApi.create({ title: title.trim(), text_note: textNote.trim() });
      navigate(`/observations/${observation.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save observation.");
      setSaving(false);
    }
  }

  return (
    <main className="page narrow-page">
      <Link className="back-link" to="/">← All observations</Link>
      <section className="form-intro">
        <p className="eyebrow">New field note</p>
        <h1>What did you observe?</h1>
        <p>Start with the facts. You can attach evidence and findings later.</p>
      </section>
      <form className="form-card" onSubmit={handleSubmit}>
        <label htmlFor="title">Short title</label>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder="e.g. Water pooling near west entrance"
          required
          autoFocus
        />
        <label htmlFor="note">Field note <span className="optional">(optional)</span></label>
        <textarea
          id="note"
          name="note"
          value={textNote}
          onChange={(event) => setTextNote(event.target.value)}
          rows={6}
          placeholder="Describe what you saw, where it was, and any useful context."
        />
        <p className="form-hint">Record what you observed; interpretation can come later.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="form-actions">
          <Link className="button button-quiet" to="/">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save observation"}
          </button>
        </div>
      </form>
    </main>
  );
}
