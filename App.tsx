import React, { useState, useRef } from 'react';
import JazzCanvas from './components/JazzCanvas';
import { AppState } from './types';
import { audioEngine } from './services/audioEngine';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [isRecording, setIsRecording] = useState(false);
  
  // Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>(''); // Store the selected format

  const startExperience = async () => {
    setAppState(AppState.LOADING);
    try {
      await audioEngine.initialize();
      setAppState(AppState.RUNNING);
    } catch (e) {
      console.error(e);
      setAppState(AppState.ERROR);
    }
  };

  const handleToggleRecord = async () => {
    if (!isRecording) {
      startVideoRecording();
    } else {
      stopVideoRecording();
    }
  };

  // Smart Format Selector Logic
  const getSupportedMimeType = (): string => {
    const types = [
      'video/mp4; codecs=h264,aac',     // Safari / Broad compatibility
      'video/mp4',                      // Generic MP4
      'video/webm; codecs=vp9,opus',    // Chrome High Quality
      'video/webm; codecs=vp8,opus',    // Chrome Standard
      'video/webm'                      // Fallback
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        console.log(`Video Recorder using: ${type}`);
        return type;
      }
    }
    return ''; // Let browser choose default
  };

  const startVideoRecording = () => {
    // 1. Get Canvas Stream
    const canvasElement = document.querySelector('canvas');
    if (!canvasElement) {
        console.error("Canvas not found for recording");
        return;
    }
    // captureStream casting for TS
    const canvasStream = (canvasElement as any).captureStream(30); // 30 FPS
    const videoTrack = canvasStream.getVideoTracks()[0];

    // 2. Get Audio Stream
    const audioStream = audioEngine.getAudioStream();
    if (!audioStream) {
        console.error("Audio stream not available");
        return;
    }
    const audioTrack = audioStream.getAudioTracks()[0];

    // 3. Combine Streams
    const combinedStream = new MediaStream([videoTrack, audioTrack]);

    // 4. Initialize Recorder with Smart Format
    try {
        const chosenMimeType = getSupportedMimeType();
        const options = chosenMimeType ? { mimeType: chosenMimeType } : undefined;

        const recorder = new MediaRecorder(combinedStream, options);
        
        // Store actual mime type for saving later
        recordingMimeTypeRef.current = chosenMimeType || recorder.mimeType;
        recordedChunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        recorder.onstop = saveVideoRecording;

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);

    } catch (e) {
        console.error("Failed to start MediaRecorder:", e);
    }
  };

  const stopVideoRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const saveVideoRecording = () => {
      const mimeType = recordingMimeTypeRef.current || 'video/webm';
      // Determine extension based on chosen format
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = `My_Jazz_Performance.${extension}`;
      anchor.href = url;
      anchor.click();
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100);
      recordedChunksRef.current = [];
  };

  return (
    <div className="relative w-screen h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* Background Visualizer */}
      {(appState === AppState.RUNNING || appState === AppState.LOADING) && (
        <JazzCanvas appState={appState} setAppState={setAppState} />
      )}

      {/* Recording UI Controls */}
      {appState === AppState.RUNNING && (
        <button 
            onClick={handleToggleRecord}
            className={`absolute top-6 right-6 z-50 px-6 py-2 rounded-full font-bold border transition-all shadow-lg flex items-center gap-2 ${
                isRecording 
                ? 'bg-red-600 border-red-600 text-white animate-pulse' 
                : 'bg-transparent border-white text-white hover:bg-white hover:text-black'
            }`}
        >
            {isRecording && <div className="w-3 h-3 bg-white rounded-full animate-bounce" />}
            {isRecording ? 'STOP & SAVE' : 'REC VIDEO'}
        </button>
      )}

      {/* Start Overlay */}
      {appState === AppState.IDLE && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
            The Jazz Fluid Conductor
          </h1>
          <p className="max-w-xl text-gray-400 mb-8 text-lg">
            A generative audio-visual quartet.
            <br />
            <br />
            <span className="text-cyan-400 font-bold">Right Hand:</span> Vibes & Neon
            <br />
            <span className="text-purple-400 font-bold">Left Hand:</span> Saxophone & Gold
          </p>
          <button
            onClick={startExperience}
            className="px-8 py-4 bg-white text-black font-bold text-xl rounded-full hover:scale-105 hover:bg-cyan-100 transition-all shadow-[0_0_20px_rgba(0,255,255,0.5)]"
          >
            Start Session
          </button>
          <p className="mt-8 text-xs text-gray-600">Requires Camera & Audio Permissions</p>
        </div>
      )}

      {/* Loading Overlay */}
      {appState === AppState.LOADING && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-transparent pointer-events-none">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      )}

      {/* Error Overlay */}
      {appState === AppState.ERROR && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">System Failure</h2>
          <p className="text-gray-400 max-w-md">
            Camera access denied. Please check your browser permissions.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 border border-white rounded hover:bg-white hover:text-black transition-colors"
          >
            Reload
          </button>
        </div>
      )}
      
      {/* Persistent UI Controls (Footer) */}
      {appState === AppState.RUNNING && (
        <div className="absolute bottom-6 right-6 z-40 pointer-events-none">
           <div className="text-white/30 text-xs font-mono">
              The Jazz Fluid Conductor v2.1 • A/V Recording (Smart Format)
           </div>
        </div>
      )}
    </div>
  );
};

export default App;