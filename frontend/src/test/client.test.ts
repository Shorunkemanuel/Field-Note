import { afterEach, describe, expect, it, vi } from "vitest";
import { extractionsApi } from "../api/client";
import type { LocalCapture } from "../types";

describe("extractionsApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uploads a persisted capture and its media as multipart without browser credentials", async () => {
    const capture: LocalCapture = {
      id: "d9c660c2-01a5-45b4-9f72-87e49a71a6fd",
      title: "Uneven path",
      text_note: "Near the west gate.",
      status: "DRAFT",
      created_at: "2026-10-11T05:00:00Z",
      location: null,
      evidence: [{
        id: "a7baea28-aafe-4e2c-806d-4bb99265160f",
        type: "PHOTO",
        name: "path.png",
        mime_type: "image/png",
        created_at: "2026-10-11T05:00:00Z",
        blob: new Blob(["image bytes"], { type: "image/png" }),
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        capture_id: capture.id,
        status: "AI_DRAFT",
        findings: [],
        limitations: [],
        provider: "test-provider",
        model: "open-weight-vision-test",
      }),
    })));

    await extractionsApi.create(capture);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/extractions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).not.toHaveProperty("Content-Type");
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    const submittedCapture = JSON.parse(String(form.get("capture")));
    expect(submittedCapture.text_note).toBe(capture.text_note);
    expect(submittedCapture.evidence[0].id).toBe(capture.evidence[0].id);
    expect(submittedCapture.ai_extraction).toBeUndefined();
    const uploaded = form.get(`evidence:${capture.evidence[0].id}`) as File;
    expect(uploaded.name).toBe("path.png");
    expect(uploaded.type).toBe("image/png");
    expect(uploaded.size).toBe(capture.evidence[0].blob.size);
  });
});
