import React, { useState } from 'react';
import JazzCanvas from './components/JazzCanvas';
import { AppState } from './types';
import { audioEngine } from './services/audioEngine';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);

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

  return (
    <div className="relative w-screen h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* Background Visualizer */}
      {(appState === AppState.RUNNING || appState === AppState.LOADING) && (
        <JazzCanvas appState={appState} setAppState={setAppState} />
      )}

      {/* Start Overlay */}
      {appState === AppState.IDLE && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
            The Jazz Fluid Conductor
          </h1>
          <p className="max-w-xl text-gray-400 mb-8 text-lg">
            A generative audio-visual experience. 
            <br />
            <br />
            <span className="text-cyan-400 font-bold">Right Hand:</span> Lead Melody & Attraction
            <br />
            <span className="text-purple-400 font-bold">Left Hand:</span> Harmony & Turbulence
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
          <p className="text-gray-400">
            Could not access Camera or Audio Context. Please refresh and allow permissions.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 border border-white rounded hover:bg-white hover:text-black transition-colors"
          >
            Reload
          </button>
        </div>
      )}
      
      {/* Persistent UI Controls (Optional) */}
      {appState === AppState.RUNNING && (
        <div className="absolute bottom-6 right-6 z-40">
           <div className="text-white/30 text-xs font-mono">
              The Jazz Fluid Conductor v1.0
           </div>
        </div>
      )}
    </div>
  );
};

export default App;