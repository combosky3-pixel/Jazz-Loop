
import * as Tone from 'tone';
import { BeatCallback, NoteCallback, GameGenre } from '../types';

// --- SCALES ---
const JAZZ_SCALE_RIGHT = ['C5', 'D5', 'Eb5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'Eb6', 'F6'];
const JAZZ_SCALE_LEFT = ['C3', 'Eb3', 'F3', 'G3', 'Bb3', 'C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5'];
const JAZZ_BASS = ['C2', 'Eb2', 'F2', 'Gb2', 'G2', 'Bb2', 'C3'];

const ELECTRONIC_SCALE_RIGHT = ['E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5', 'D6', 'E6']; 
const ELECTRONIC_SCALE_LEFT = ['E3', 'G3', 'A3', 'B3', 'D4', 'E4']; 
const ELECTRONIC_BASS = ['E2', 'E2', 'G2', 'E2', 'A2', 'E2', 'B2', 'D2'];

// Funk: E Mixolydian / Dorian hybrid for that classic vibe
const FUNK_SCALE_RIGHT = ['E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5', 'D6']; 
const FUNK_SCALE_LEFT = ['E3', 'G3', 'A3', 'B3', 'D4', 'E4']; // Rhythm Guitar chords
// Bass pattern is procedural in the loop now

class AudioEngine {
  // Master
  private limiter: Tone.Limiter | null = null;
  private meter: Tone.Meter | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private reverb: Tone.Reverb | null = null;
  private currentGenre: GameGenre = GameGenre.JAZZ;

  // Instruments
  private rightSynth: Tone.Synth | Tone.MonoSynth | Tone.FMSynth | Tone.PolySynth | null = null;
  private leftSynth: Tone.MonoSynth | Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private drumKick: Tone.MembraneSynth | null = null;
  private drumSnare: Tone.NoiseSynth | Tone.MetalSynth | null = null;
  private drumHiHat: Tone.MetalSynth | null = null;

  // Effects
  private leftEffect: Tone.Effect | Tone.Filter | Tone.AutoWah | null = null; 
  private rightEffect: Tone.Effect | null = null; 
  private rightFilter: Tone.Filter | null = null; // For Jazz Piano
  private leftFilter: Tone.Filter | null = null; // For Electronic Pad / Funk Wah
  private extraEffect: Tone.Effect | null = null; 
  private funkVibrato: Tone.Vibrato | null = null; // Specific for Funk Lead

  // Callbacks
  private beatCallback: BeatCallback | null = null;
  private noteCallback: NoteCallback | null = null;

  // State
  private isInitialized = false;
  private lastRightTime = 0;
  private lastLeftTime = 0;
  private lastLeftNoteIndex = -1;
  private loopCounter = 0;
  
  public async initialize() {
    if (this.isInitialized) return;
    await Tone.start();
    
    this.limiter = new Tone.Limiter(-1).toDestination();
    // Add Meter to measure output level for visuals
    this.meter = new Tone.Meter();
    this.limiter.connect(this.meter);

    const context = Tone.context.rawContext as AudioContext;
    this.audioDest = context.createMediaStreamDestination();
    this.limiter.connect(this.audioDest);
    
    this.reverb = new Tone.Reverb({ decay: 2.0, wet: 0.2 }).connect(this.limiter);
    this.isInitialized = true;
  }

  public getEnergy(): number {
    if (!this.meter) return 0;
    // Tone.Meter returns decibels (approx -Infinity to 0).
    // Convert to linear gain (0 to 1) for easier visual mapping.
    const db = this.meter.getValue();
    if (typeof db === 'number') {
        return Tone.dbToGain(db);
    }
    return 0;
  }

  public stop() {
    try {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        this.disposeInstruments();
        this.beatCallback = null;
        this.noteCallback = null;
    } catch (e) {
        console.warn("Error stopping audio engine", e);
    }
  }

  public async loadGenre(genre: GameGenre) {
    if (!this.isInitialized) await this.initialize();
    this.currentGenre = genre;
    
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;
    
    this.lastRightTime = 0;
    this.lastLeftTime = 0;
    this.lastLeftNoteIndex = -1;
    this.loopCounter = 0;

    this.disposeInstruments();

    if (genre === GameGenre.JAZZ) this.setupJazz();
    else if (genre === GameGenre.ELECTRONIC) this.setupElectronic();
    else if (genre === GameGenre.FUNK) this.setupFunk();

    this.startBackingTrack();
    Tone.Transport.start();
  }

  private disposeInstruments() {
      try {
        this.rightSynth?.dispose(); this.rightSynth = null;
        this.leftSynth?.dispose(); this.leftSynth = null;
        this.bassSynth?.dispose(); this.bassSynth = null;
        this.drumKick?.dispose(); this.drumKick = null;
        this.drumSnare?.dispose(); this.drumSnare = null;
        this.drumHiHat?.dispose(); this.drumHiHat = null;
        
        this.leftEffect?.dispose(); this.leftEffect = null;
        this.rightEffect?.dispose(); this.rightEffect = null;
        this.extraEffect?.dispose(); this.extraEffect = null;
        
        this.rightFilter?.dispose(); this.rightFilter = null;
        this.leftFilter?.dispose(); this.leftFilter = null;
        
        this.funkVibrato?.dispose(); this.funkVibrato = null;
      } catch(e) { console.warn("Error disposing instruments", e); }
  }

  // =================================================================
  // GENRE SETUP
  // =================================================================

  private setupJazz() {
    Tone.Transport.bpm.value = 120;
    Tone.Transport.swing = 0.6;

    // Right: Jazz Electric Piano (Rhodes Style)
    this.rightSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "pulse", width: 0.5 },
      envelope: { 
          attack: 0.02, 
          decay: 0.4, 
          sustain: 0.2, 
          release: 1.5 
      }, 
      volume: -4
    });
    
    this.rightFilter = new Tone.Filter(1200, "lowpass");
    this.rightEffect = new Tone.Tremolo({ frequency: 6, depth: 0.5 }).start();

    this.rightSynth.chain(this.rightFilter, this.rightEffect, this.reverb!);

    // Left: Bright Sax (Sawtooth MonoSynth)
    this.leftSynth = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 1.0, release: 0.8 },
      filter: { Q: 3, type: "lowpass", rolloff: -24 },
      filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.8, baseFrequency: 800, octaves: 3.5 },
      volume: -4
    });
    
    const dist = new Tone.Distortion(0.15); 
    this.leftEffect = new Tone.Filter({ frequency: 2000, type: "lowpass", Q: 1 });
    this.leftSynth.chain(dist, this.leftEffect, this.reverb!);

    // Bass
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 1.5 },
      filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.8, baseFrequency: 100, octaves: 2 },
      volume: 2
    }).connect(this.limiter!);

    // Drums
    this.drumHiHat = new Tone.MetalSynth({ 
        volume: -2, 
        harmonicity: 5.1, 
        modulationIndex: 32,
        envelope: { attack: 0.001, decay: 0.1, release: 0.01 }
    }).connect(this.reverb!);

    this.drumKick = new Tone.MembraneSynth({ volume: -Infinity }).connect(this.limiter!);
  }

  private setupElectronic() {
    Tone.Transport.bpm.value = 135; // Faster BPM for Electronic
    Tone.Transport.swing = 0;

    // Right: Hard Lead (Distorted MonoSynth)
    this.rightSynth = new Tone.MonoSynth({
      oscillator: { type: "square" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.1 },
      volume: -6
    });
    this.rightEffect = new Tone.Distortion(0.6).connect(this.reverb!);
    this.rightSynth.connect(this.rightEffect);

    // Left: Super Saw Chords
    this.leftSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.5 },
      volume: -8
    });
    
    // Chain: Synth -> Distortion -> DJ Filter (LowPass) -> Reverb
    const dist = new Tone.Distortion(0.4);
    this.leftFilter = new Tone.Filter(20000, "lowpass"); // Starts open
    this.leftSynth.chain(dist, this.leftFilter, this.reverb!);
    
    // Assign to leftEffect generic holder if needed
    this.leftEffect = this.leftFilter; 

    // Bass
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
      filterEnvelope: { baseFrequency: 200, octaves: 4, attack: 0.01 },
      volume: -2
    }).connect(this.limiter!);

    // Drums
    this.drumHiHat = new Tone.MetalSynth({ volume: -5, resonance: 3000 }).connect(this.limiter!);
    this.drumSnare = new Tone.NoiseSynth({ volume: -2, envelope: { decay: 0.2 } }).connect(this.reverb!);
    this.drumKick = new Tone.MembraneSynth({ 
        volume: 0, 
        pitchDecay: 0.05, 
        octaves: 8 
    }).connect(this.limiter!);
  }

  private setupFunk() {
    Tone.Transport.bpm.value = 112; // Classic P-Funk tempo
    Tone.Transport.swing = 0.1; // Subtle swing, 16th note feel

    // Right: Brass Section (PolySynth with MonoSynth voices for filter envs)
    // Simulating Trumpets/Trombones stabs
    this.rightSynth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "sawtooth" },
      envelope: { 
        attack: 0.02, 
        decay: 0.2, 
        sustain: 0.7, 
        release: 0.4 
      },
      filter: {
        type: "lowpass",
        Q: 2.5, // Brassy resonance
        rolloff: -24
      },
      filterEnvelope: {
        attack: 0.05, // The "Blare" opening
        decay: 0.2,
        sustain: 0.5,
        baseFrequency: 300,
        octaves: 4 // Opens up to bright ~4800Hz
      },
      volume: -5
    });

    // We don't need vibrato for brass fall, we need detune
    this.rightSynth.connect(this.reverb!);

    // Left: Wah-Wah Rhythm Guitar
    this.leftSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "square" }, // Square wave is great for funky stabs
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
      volume: -4
    });
    
    // The "Manual Wah" Filter
    // High Q for that "Quack" sound
    this.leftFilter = new Tone.Filter({ frequency: 2000, type: "lowpass", Q: 8 }); 
    this.leftSynth.chain(this.leftFilter, this.reverb!);
    this.leftEffect = this.leftFilter;

    // Bass: Slap Bass (Physics modeled)
    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: "square" }, // Square gives hollow slap tone
      envelope: { 
          attack: 0.01, // Snap!
          decay: 0.2,   // Fast decay
          sustain: 0,   // Staccato
          release: 0.1 
      },
      filterEnvelope: { 
          attack: 0.005, 
          decay: 0.1, 
          sustain: 0, 
          baseFrequency: 100, 
          octaves: 3.5, // Huge envelope modulation for "POP"
          exponent: 2
      },
      filter: { Q: 6, type: "lowpass" }, // Resonant pop
      volume: 0
    }).connect(this.limiter!);

    // Drums: Tight Funk Kit
    this.drumHiHat = new Tone.MetalSynth({ 
        volume: -8, 
        harmonicity: 8, 
        resonance: 4000,
        envelope: { attack: 0.001, decay: 0.05, release: 0.01 } // Super tight hats
    }).connect(this.limiter!);

    this.drumSnare = new Tone.NoiseSynth({ 
        volume: -2, 
        envelope: { attack: 0.001, decay: 0.15, sustain: 0 } // Cracking snare
    }).connect(this.reverb!);

    this.drumKick = new Tone.MembraneSynth({ 
        volume: 0, 
        pitchDecay: 0.01, // Tight punch
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.2, sustain: 0 }
    }).connect(this.limiter!);
  }

  // =================================================================
  // LOOPS
  // =================================================================

  private startBackingTrack() {
    const loop = new Tone.Loop((time) => {
      try {
          // If stopped, don't play
          if (!this.drumHiHat) return;
          
          const step = this.loopCounter % 16;
          
          // Safety check for destroyed context
          if (Tone.context.state !== 'running') return;

          if (this.currentGenre === GameGenre.JAZZ) {
            if (step % 4 === 0) {
                const bassNote = JAZZ_BASS[Math.floor(Math.random()*JAZZ_BASS.length)];
                this.bassSynth?.triggerAttackRelease(bassNote, "4n", time);
                if(this.noteCallback) Tone.Draw.schedule(() => this.noteCallback!('BASS', 0.5, 1.0), time);
                this.drumHiHat?.triggerAttackRelease("C5", "32n", time);
            }
            if (step === 6 || step === 14) {
                this.drumHiHat?.triggerAttackRelease("C5", "32n", time, 0.5);
            }

          } else if (this.currentGenre === GameGenre.ELECTRONIC) {
            if (step % 2 === 0) {
                const bassNote = ELECTRONIC_BASS[Math.floor(Math.random()*ELECTRONIC_BASS.length)];
                this.bassSynth?.triggerAttackRelease(bassNote, "8n", time);
                if(this.noteCallback) Tone.Draw.schedule(() => this.noteCallback!('BASS', 0.5, 1.0), time);
                this.drumHiHat?.triggerAttackRelease("32n", time, step % 4 === 0 ? 1 : 0.5);
            }
            if (step === 0 || step === 8 || step === 10) {
                this.drumKick?.triggerAttackRelease("C1", "16n", time);
                if(this.beatCallback) Tone.Draw.schedule(() => this.beatCallback!('KICK'), time);
            }
            if (step === 4 || step === 12) {
                (this.drumSnare as Tone.NoiseSynth)?.triggerAttackRelease("16n", time);
                if(this.beatCallback) Tone.Draw.schedule(() => this.beatCallback!('SNARE'), time);
            }

          } else if (this.currentGenre === GameGenre.FUNK) {
            // --- FUNK GROOVE (16th Note Syncopation) ---
            
            // Bass: "The One" is strictly adhered to, followed by syncopation
            // Scale: E2 Root.
            const root = "E2";
            const octave = "E3";
            const fifth = "B2";
            const flatSeven = "D3";

            // Slap Bass Pattern
            if (step === 0) this.bassSynth?.triggerAttackRelease(root, "16n", time); // THE ONE
            else if (step === 3) this.bassSynth?.triggerAttackRelease(root, "16n", time, 0.7); // Ghost
            else if (step === 6) this.bassSynth?.triggerAttackRelease(octave, "16n", time, 0.9); // Octave Pop
            else if (step === 8) this.bassSynth?.triggerAttackRelease(flatSeven, "16n", time, 0.8);
            else if (step === 11) this.bassSynth?.triggerAttackRelease(root, "16n", time, 0.6); // Ghost
            else if (step === 14) this.bassSynth?.triggerAttackRelease(fifth, "16n", time, 0.8); // Turnaround

            if (step === 0 || step === 6 || step === 14) {
                if(this.noteCallback) Tone.Draw.schedule(() => this.noteCallback!('BASS', 0.5, 1.0), time);
            }

            // Kick: 1 and... and 3... 
            if (step === 0) this.drumKick?.triggerAttackRelease("C1", "16n", time);
            else if (step === 7) this.drumKick?.triggerAttackRelease("C1", "16n", time, 0.8);
            else if (step === 10) this.drumKick?.triggerAttackRelease("C1", "16n", time, 0.7);

            if (step === 0 || step === 10) {
                if(this.beatCallback) Tone.Draw.schedule(() => this.beatCallback!('KICK'), time);
            }

            // Snare: Backbeat on 2 and 4 (Step 4 and 12) + Ghost notes
            if (step === 4 || step === 12) {
                (this.drumSnare as Tone.NoiseSynth)?.triggerAttackRelease("16n", time);
                if(this.beatCallback) Tone.Draw.schedule(() => this.beatCallback!('SNARE'), time);
            } else if (step === 15) {
                (this.drumSnare as Tone.NoiseSynth)?.triggerAttackRelease("32n", time, 0.3); // Ghost at end
            }

            // Hi-Hats: 16ths with accents
            const velocity = (step % 4 === 0) ? 1 : (step % 2 === 0 ? 0.6 : 0.3);
            // Open hat on the 'and' of 4 occasionally
            if (step === 14 && Math.random() > 0.7) {
                this.drumHiHat?.triggerAttackRelease("8n", time, 0.8); // Open hat
            } else {
                this.drumHiHat?.triggerAttackRelease("32n", time, velocity);
            }
          }

          this.loopCounter++;
      } catch (e) {
          console.warn("Error in backing track loop", e);
      }
    }, "16n");

    loop.start(0);
  }

  // =================================================================
  // INTERACTION
  // =================================================================

  public updateRightHand(y: number, x: number, trigger: boolean, squeeze: number) {
    if (!this.rightSynth || !this.isInitialized) return;

    // Automation Safety
    try {
        if (this.currentGenre === GameGenre.JAZZ) {
            if (this.rightSynth instanceof Tone.PolySynth) {
                 this.rightSynth.set({ detune: squeeze * -50 });
            }
        } else if (this.currentGenre === GameGenre.ELECTRONIC) {
            if (this.rightSynth instanceof Tone.MonoSynth) {
                 this.rightSynth.detune.rampTo(squeeze * -1200, 0.05);
            }
        } else if (this.currentGenre === GameGenre.FUNK) {
            // Funk Brass Section (Right Hand)
            // Gesture: "The Fall" / "Doit"
            // Hand Open (0.0) -> Standard Pitch
            // Hand Closed (1.0) -> Drop Pitch (-500 cents / 5 semitones)
            // This happens fast to simulate the drop at the end of a note.
            if (this.rightSynth instanceof Tone.PolySynth) {
                 // PolySynth with MonoSynth voices
                 this.rightSynth.set({ detune: squeeze * -500 });
            }
        }
    } catch (e) {}

    if (trigger) {
        const scale = this.currentGenre === GameGenre.ELECTRONIC ? ELECTRONIC_SCALE_RIGHT 
                    : this.currentGenre === GameGenre.FUNK ? FUNK_SCALE_RIGHT 
                    : JAZZ_SCALE_RIGHT;
        
        const normalizedY = 1 - Math.max(0, Math.min(1, y));
        const noteIndex = Math.floor(normalizedY * scale.length);
        const note = scale[noteIndex];

        // Ensure we schedule in the future or now
        const nextDiv = Tone.Transport.nextSubdivision("16n");
        const now = Tone.now();
        const triggerTime = Math.max(now, nextDiv);

        if (triggerTime > this.lastRightTime) {
            try {
                this.rightSynth.triggerAttackRelease(note, "8n", triggerTime);
                this.lastRightTime = triggerTime;
                
                if (this.noteCallback) Tone.Draw.schedule(() => this.noteCallback!('LEAD', x, y), triggerTime);
            } catch(e) { console.warn("Right hand scheduling error", e); }
        }
    }
  }

  public updateLeftHand(y: number, x: number, trigger: boolean, squeeze: number) {
      if (!this.leftSynth || !this.leftEffect || !this.isInitialized) return;

      try {
        if (this.currentGenre === GameGenre.JAZZ) {
            (this.leftSynth as Tone.MonoSynth).detune.rampTo(squeeze * -200, 0.1);
            if(this.leftEffect instanceof Tone.Filter) {
                this.leftEffect.frequency.rampTo(500 + (x * 3500), 0.1);
            }
            
        } else if (this.currentGenre === GameGenre.ELECTRONIC) {
            const cutoff = 200 + ((1.0 - squeeze) * 8000); 
            if (this.leftFilter) {
                this.leftFilter.frequency.rampTo(cutoff, 0.1);
            }
        } else if (this.currentGenre === GameGenre.FUNK) {
            // Funk Manual Wah-Wah
            // Hand Open (0.0 squeeze) -> High Freq (Wah!)
            // Hand Closed (1.0 squeeze) -> Low Freq (Ooh...)
            if (this.leftFilter) {
                 const openness = 1.0 - squeeze; // 1 = Open, 0 = Closed
                 // Map openness to frequency: 300Hz (Closed) -> 3500Hz (Open)
                 const wahFreq = 300 + (openness * 3200);
                 this.leftFilter.frequency.rampTo(wahFreq, 0.05);
            }
        }
      } catch (e) {}

      if (trigger) {
          const scale = this.currentGenre === GameGenre.ELECTRONIC ? ELECTRONIC_SCALE_LEFT 
                      : this.currentGenre === GameGenre.FUNK ? FUNK_SCALE_LEFT 
                      : JAZZ_SCALE_LEFT;

          const normalizedY = 1 - Math.max(0, Math.min(1, y));
          const noteIndex = Math.floor(normalizedY * scale.length);
          const note = scale[noteIndex];

          const nextDiv = Tone.Transport.nextSubdivision("16n");
          const now = Tone.now();
          const triggerTime = Math.max(now, nextDiv);

          if (triggerTime > this.lastLeftTime) {
              try {
                if (this.leftSynth instanceof Tone.PolySynth) {
                    this.leftSynth.triggerAttackRelease(note, "16n", triggerTime);
                } else {
                    this.leftSynth.triggerAttackRelease(note, "8n", triggerTime);
                }
                
                this.lastLeftTime = triggerTime;
                this.lastLeftNoteIndex = noteIndex;

                if (this.noteCallback) Tone.Draw.schedule(() => this.noteCallback!('RHYTHM', x, y), triggerTime);
              } catch(e) { console.warn("Left hand scheduling error", e); }
          }
      }
  }

  public getAudioStream() { return this.audioDest?.stream; }
  public onBeat(cb: BeatCallback) { this.beatCallback = cb; }
  public onNoteTriggered(cb: NoteCallback) { this.noteCallback = cb; }
  public setGlobalEnergy(e: number) {}
}

export const audioEngine = new AudioEngine();
