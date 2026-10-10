import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "../App";

let createObjectURLDescriptor: PropertyDescriptor | undefined;
let revokeObjectURLDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let geolocationDescriptor: PropertyDescriptor | undefined;

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function apiResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe("Field-Note interactions", () => {
  beforeEach(async () => {
    mediaDevicesDescriptor = undefined;
    geolocationDescriptor = undefined;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("field-note-local");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Could not reset test IndexedDB."));
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/observations" && init?.method === "POST") {
        return apiResponse({
          id: "server-observation-1",
          title: "Cracked paving",
          text_note: "Near the north gate.",
          status: "DRAFT",
          created_at: "2026-10-10T00:00:00Z",
          evidence: [],
          findings: [],
        });
      }
      if (path === "/api/observations/server-observation-1") {
        return apiResponse({
          id: "server-observation-1",
          title: "Cracked paving",
          text_note: "Near the north gate.",
          status: "DRAFT",
          created_at: "2026-10-10T00:00:00Z",
          evidence: [],
          findings: [],
        });
      }
      return apiResponse([]);
    }));
    createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-evidence"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (createObjectURLDescriptor) {
      Object.defineProperty(URL, "createObjectURL", createObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (revokeObjectURLDescriptor) {
      Object.defineProperty(URL, "revokeObjectURL", revokeObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    if (geolocationDescriptor) {
      Object.defineProperty(navigator, "geolocation", geolocationDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });

  it("creates an M1 observation and opens the saved server record", async () => {
    const user = userEvent.setup();
    renderApp("/observations/new");

    await user.type(screen.getByLabelText("Short title"), "Cracked paving");
    await user.type(screen.getByLabelText(/Field note/), "Near the north gate.");
    await user.click(screen.getByRole("button", { name: "Save observation" }));

    expect(await screen.findByRole("heading", { name: "Cracked paving" })).toBeInTheDocument();
    expect(screen.getByText("Near the north gate.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/observations", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenCalledWith("/api/observations/server-observation-1", expect.anything());
  });

  it("saves a photo capture locally, previews evidence, and reopens it from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    renderApp();

    await user.click(screen.getByRole("link", { name: /Capture field note/ }));
    await user.type(await screen.findByLabelText("Short title"), "West entrance puddle");
    await user.type(screen.getByLabelText(/Field note/), "Water is pooling by the door.");
    const photo = new File(["image-bytes"], "site-photo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Take or choose photos/), photo);

    expect(screen.getByRole("img", { name: "Preview: site-photo.png" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save field note" }));

    expect(await screen.findByRole("heading", { name: "West entrance puddle" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Captured evidence: site-photo.png" })).toBeInTheDocument();
    expect(screen.getByText("Water is pooling by the door.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /All observations/ }));
    await user.click(await screen.findByRole("link", { name: /West entrance puddle/ }));
    expect(await screen.findByRole("img", { name: "Captured evidence: site-photo.png" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/observations", expect.objectContaining({ method: "POST" }));
  });

  it("records a voice note and makes the saved audio available in the detail view", async () => {
    const user = userEvent.setup();
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    class TestMediaRecorder {
      state: RecordingState = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_mediaStream: MediaStream) {}
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) } as BlobEvent);
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", TestMediaRecorder);
    renderApp("/capture");
    const userTitle = screen.getByLabelText("Short title");
    await user.type(userTitle, "Pump noise");
    await user.click(screen.getByRole("button", { name: "Record voice note" }));
    await user.click(await screen.findByRole("button", { name: "Stop voice recording" }));

    expect(screen.getByText("Voice recording 1")).toBeInTheDocument();
    expect(document.querySelector("audio")?.controls).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save field note" }));

    expect(await screen.findByRole("heading", { name: "Pump noise" })).toBeInTheDocument();
    expect(document.querySelector("audio")?.controls).toBe(true);
    expect(track.stop).toHaveBeenCalled();
  });

  it("adds and removes an optional location", async () => {
    const user = userEvent.setup();
    geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, "geolocation");
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: { latitude: 47.6, longitude: -122.3, accuracy: 8 },
        } as GeolocationPosition),
      },
    });
    renderApp("/capture");
    await user.type(screen.getByLabelText("Short title"), "Drain location");
    await user.click(screen.getByRole("button", { name: "Add location" }));
    expect(await screen.findByText("Location added to this field note.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove location" }));
    expect(screen.getByText("Location removed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save field note" }));
    expect(await screen.findByRole("heading", { name: "Drain location" })).toBeInTheDocument();
    expect(screen.queryByText(/Location recorded with permission/)).not.toBeInTheDocument();
  });

  it("removes selected evidence before saving", async () => {
    const user = userEvent.setup();
    renderApp("/capture");
    await user.type(screen.getByLabelText("Short title"), "Clear drain");
    const photo = new File(["image-bytes"], "discarded.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Take or choose photos/), photo);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("img", { name: "Preview: discarded.png" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save field note" }));
    await waitFor(() => expect(screen.getByText("No evidence attached.")).toBeInTheDocument());
  });
});
