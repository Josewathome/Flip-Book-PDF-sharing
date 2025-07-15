/// <reference lib="webworker" />

// @ts-ignore - FFmpeg types are not properly resolved but the imports work
import { createFFmpeg } from '@ffmpeg/ffmpeg';
// @ts-ignore - FFmpeg types are not properly resolved but the imports work
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = createFFmpeg({ log: true });

interface WorkerMessage {
  segments: Blob[];
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { segments } = e.data;
  console.log(`[FFmpeg Worker] Starting to process ${segments.length} audio segments`);

  if (!ffmpeg.isLoaded()) {
    console.log('[FFmpeg Worker] Loading FFmpeg...');
    await ffmpeg.load();
    console.log('[FFmpeg Worker] FFmpeg loaded successfully');
  }

  console.log('[FFmpeg Worker] Writing individual segments to FFmpeg filesystem...');
  for (let i = 0; i < segments.length; i++) {
    console.log(`[FFmpeg Worker] Processing segment ${i + 1}/${segments.length}`);
    const fileData = await fetchFile(segments[i]);
    ffmpeg.FS('writeFile', `seg${i}.mp3`, fileData);
    console.log(`[FFmpeg Worker] Segment ${i + 1} written to filesystem`);
  }

  console.log('[FFmpeg Worker] Creating concatenation file list...');
  const inputFiles = segments.map((_, i) => `file 'seg${i}.mp3'`).join('\n');
  ffmpeg.FS('writeFile', 'concat.txt', new TextEncoder().encode(inputFiles));

  console.log('[FFmpeg Worker] Starting audio concatenation process...');
  await ffmpeg.run(
    '-f', 'concat', '-safe', '0',
    '-i', 'concat.txt',
    '-c', 'copy',
    'output.mp3'
  );
  console.log('[FFmpeg Worker] Audio concatenation completed');

  console.log('[FFmpeg Worker] Reading final output file...');
  const data = ffmpeg.FS('readFile', 'output.mp3');
  console.log('[FFmpeg Worker] Sending combined audio back to main thread');
  self.postMessage(data.buffer, { transfer: [data.buffer] });
};
