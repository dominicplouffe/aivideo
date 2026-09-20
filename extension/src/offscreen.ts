import type { ExtensionMessage } from "./protocol";

/**
 * The offscreen document.
 *
 * It exists for one reason: an MV3 service worker has no DOM, and therefore
 * no `MediaRecorder`. Chrome's answer is a hidden document that does, and
 * this is it — a page whose entire job is to hold a stream open.
 *
 * Its other job is to be the only place raw media lives. Frames go from the
 * tab, through the recorder, into a blob here, and out to storage. They are
 * never handed to the service worker, which can be terminated mid-transfer,
 * and never to the content script, which runs inside the customer's own
 * application.
 */

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startedAt = 0;
let stream: MediaStream | null = null;

function send(message: ExtensionMessage) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function startRecording(streamId: string, withMicrophone: boolean) {
  const video = (await navigator.mediaDevices.getUserMedia({
    audio: {
      // Tab audio: the product's own sounds belong in the demo.
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
        // A demo is UI, not film. 30fps of crisp text beats 60fps of mush
        // at the same bitrate, and screen content compresses on detail.
        maxFrameRate: 30,
        maxWidth: 3840,
        maxHeight: 2160,
      },
    },
  } as unknown as MediaStreamConstraints)) as MediaStream;

  // Capturing a tab mutes it for the person recording. Piping it back is the
  // difference between a usable take and one narrated into silence.
  const context = new AudioContext();
  context.createMediaStreamSource(video).connect(context.destination);

  const tracks = [...video.getTracks()];

  if (withMicrophone) {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    // Kept as a separate track rather than mixed: the editor needs to treat
    // narration and product audio independently, and a mix cannot be undone.
    tracks.push(...mic.getAudioTracks());
  }

  stream = new MediaStream(tracks);

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type));

  recorder = new MediaRecorder(stream, {
    mimeType,
    // High enough that a re-encode to h264 later is not compounding losses.
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });

  chunks = [];
  startedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    send({ type: "offscreen/chunk", bytes: event.data.size });
  };

  recorder.onerror = (event) => {
    send({ type: "offscreen/error", message: String((event as ErrorEvent).error ?? event.type) });
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType ?? "video/webm" });
    // A blob URL rather than the bytes: passing hundreds of megabytes
    // through the message channel would serialise the whole recording into
    // a structured clone, twice.
    send({
      type: "offscreen/done",
      videoUrl: URL.createObjectURL(blob),
      durationSec: (Date.now() - startedAt) / 1000,
      bytes: blob.size,
    });
    chunks = [];
  };

  // One second per chunk. Small enough that a crash loses a second rather
  // than a session, large enough not to spam the worker.
  recorder.start(1000);
}

function stopRecording() {
  recorder?.stop();
  stream?.getTracks().forEach((track) => track.stop());
  recorder = null;
  stream = null;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "offscreen/record") {
    startRecording(message.streamId, message.withMicrophone).catch((error) =>
      send({ type: "offscreen/error", message: String(error) }),
    );
  }
  if (message.type === "offscreen/stop") stopRecording();
  return undefined;
});
