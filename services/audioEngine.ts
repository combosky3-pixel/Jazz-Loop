import * as Tone from 'tone';
import { BeatCallback, NoteCallback } from '../types';

// C Minor Blues Scale for Melody (Right Hand) - C5 to C6
const MELODY_SCALE = ['C5', 'D5', 'Eb5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'Eb6', 'F6'];

// Saxophone Scale (Left Hand) - Lower Register C3 to C5 (Dorianish)
const SAX_SCALE = ['C3', 'Eb3', 'F3', 'G3', 'Bb3', 'C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5'];

// Bass Scale (Automatic)
const BASS_SCALE_NOTES = ['C2', 'Eb2', 'F2', 'Gb2', 'G2', 'Bb2', 'C3'];

class AudioEngine {
  private leadSynth: Tone.Synth | null = null;
  private saxSynth: Tone.MonoSynth | null = null;
  private saxFilter: Tone.Filter | null = null;
  private doubleBass: Tone.MonoSynth | null = null;
  private rideCymbal: Tone.MetalSynth | null = null;
  private kickDrum: Tone.MembraneSynth | null = null;
  private limiter: Tone.Limiter | null = null;
  
  // Effects
  private reverb: Tone.Reverb | null = null;
  private saxVibrato: Tone.Vibrato | null = null;
  
  private isInitialized = false;
  private beatCallback: BeatCallback | null = null;
  private noteCallback: NoteCallback | null = null;
  
  // State
  private lastLeadTime = 0;
  private lastSaxTime = 0;
  private lastSaxNoteIndex = -1;
  private lastBassNoteIndex = 0;

  public async initialize() {
    if (this.isInitialized) return;
    await Tone.start();

    // 1. Master Chain
    this.limiter = new Tone.Limiter(-1).toDestination();
    
    // Spacious Reverb for that Jazz Club feel
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 }).connect(this.limiter);

    // 2. Transport
    Tone.Transport.bpm.value = 120;
    Tone.Transport.swing = 0.6;
    Tone.Transport.swingSubdivision = "8n"; 

    // --- INSTRUMENTS ---

    // A. Right Hand: Vibes (Crystal/Glassy) - Kept from previous
    this.leadSynth = new Tone.Synth({
      oscillator: { type: "triangle" }, 
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 1.0 },
      volume: -2
    }).connect(this.reverb);

    // B. Left Hand: Tenor Saxophone (New)
    this.saxSynth = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" }, // Rich harmonics for "reedy" sound
        envelope: { 
            attack: 0.1, // Softer attack (Legato)
            decay: 0.2, 
            sustain: 0.8, 
            release: 0.8 // Breath fade
        },
        volume: -4
    });

    this.saxVibrato = new Tone.Vibrato({
        frequency: 5, // Typical vibrato speed
        depth: 0.1,
        wet: 0.5
    }).connect(this.reverb);

    // Dynamic Filter for Expression (controlled by Hand X)
    // LowPass with Resonance (Q) simulates the spectral change of blowing harder
    this.saxFilter = new Tone.Filter({
        frequency: 800,
        type: "lowpass",
        Q: 2 
    }).connect(this.saxVibrato);

    this.saxSynth.connect(this.saxFilter);


    // C. Auto Bass: Double Bass (Thick, Plucky, Automatic)
    this.doubleBass = new Tone.MonoSynth({
        oscillator: { type: "triangle" }, // Triangle for thick string sound
        envelope: { 
            attack: 0.02, 
            decay: 0.6, 
            sustain: 0.1, 
            release: 0.8 
        },
        filterEnvelope: {
            attack: 0.005,
            decay: 0.3,
            sustain: 0.2,
            release: 0.8,
            baseFrequency: 80,
            octaves: 2
        },
        volume: 2 // BOOSTED as requested (+2)
    }).connect(this.limiter);


    // D. Drums (Backing)
    this.rideCymbal = new Tone.MetalSynth({
      frequency: 200, 
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1, 
      modulationIndex: 32, 
      resonance: 4000, 
      octaves: 1.5,
      volume: -2 
    }).connect(this.reverb);

    this.kickDrum = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 5, 
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
      volume: 0 
    }).connect(this.limiter);

    // --- LOOPS & SEQUENCES ---

    // 1. Automatic Walking Bass (Quarter Notes)
    const bassLoop = new Tone.Loop((time) => {
        if (!this.doubleBass) return;

        // Random Walk Logic
        const r = Math.random();
        let nextIndex;
        if (r < 0.7) {
            // Stepwise
            const direction = Math.random() > 0.5 ? 1 : -1;
            nextIndex = this.lastBassNoteIndex + direction;
            if (nextIndex < 0) nextIndex = BASS_SCALE_NOTES.length - 1;
            if (nextIndex >= BASS_SCALE_NOTES.length) nextIndex = 0;
        } else {
            // Leap
            nextIndex = Math.floor(Math.random() * BASS_SCALE_NOTES.length);
        }
        this.lastBassNoteIndex = nextIndex;
        
        const note = BASS_SCALE_NOTES[nextIndex];
        this.doubleBass.triggerAttackRelease(note, "4n", time);
        
        // Visual callback for Bass (Fixed position - bottom center for visual pulse)
        if (this.noteCallback) {
            Tone.Draw.schedule(() => {
                this.noteCallback!('BASS', 0.5, 1.0);
            }, time);
        }
    }, "4n");


    // 2. Ride Cymbal (Swing Pattern)
    const rideSeq = new Tone.Sequence((time, vel) => {
      if (vel > 0) {
        const velocity = vel === 1 ? 1.0 : 0.3; 
        this.rideCymbal?.triggerAttackRelease("C5", "32n", time, velocity);
      }
    }, [1, [1, 0.5], 1, [1, 0.5]], "4n");

    // 3. Kick Drum (Heartbeat)
    const kickLoop = new Tone.Loop((time) => {
       this.kickDrum?.triggerAttackRelease("C1", "8n", time);
       if (this.beatCallback) Tone.Draw.schedule(() => this.beatCallback!('KICK'), time);
    }, "2n");

    bassLoop.start(0);
    rideSeq.start(0);
    kickLoop.start(0);

    Tone.Transport.start();
    this.isInitialized = true;
  }

  public onBeat(callback: BeatCallback) {
    this.beatCallback = callback;
  }

  public onNoteTriggered(callback: NoteCallback) {
    this.noteCallback = callback;
  }

  public setGlobalEnergy(energy: number) {
    // We could map energy to drum intensity here if desired
  }

  // Right Hand: Vibes (Quantized)
  public updateLead(y: number, x: number, trigger: boolean) {
    if (!this.leadSynth) return;

    if (trigger) {
      const normalizedY = 1 - Math.max(0, Math.min(1, y));
      const noteIndex = Math.floor(normalizedY * MELODY_SCALE.length);
      const note = MELODY_SCALE[noteIndex];

      const nextDiv = Tone.Transport.nextSubdivision("8n");
      
      if (nextDiv > this.lastLeadTime) {
        this.leadSynth.triggerAttackRelease(note, "8n", nextDiv);
        this.lastLeadTime = nextDiv;

        if (this.noteCallback) {
            Tone.Draw.schedule(() => {
                this.noteCallback!('LEAD', x, y);
            }, nextDiv);
        }
      }
    }
  }

  // Left Hand: Saxophone Control
  public updateSax(y: number, x: number, trigger: boolean) {
      if (!this.saxSynth || !this.saxFilter) return;

      // 1. Expression (X-Axis -> Filter)
      // Left (0) = Warm/Muffled (400Hz)
      // Right (1) = Bright/Screaming (3000Hz)
      const filterFreq = 400 + (x * 2600);
      this.saxFilter.frequency.rampTo(filterFreq, 0.1);

      if (trigger) {
          const normalizedY = 1 - Math.max(0, Math.min(1, y));
          const noteIndex = Math.floor(normalizedY * SAX_SCALE.length);
          const note = SAX_SCALE[noteIndex];

          // Quantize to 8n to keep it locked to groove.
          const nextDiv = Tone.Transport.nextSubdivision("8n");

          // CRITICAL FIX: Ensure start time is strictly greater than previous
          // The previous code allowed re-triggering if noteIndex changed within the same subdivision,
          // causing scheduling collisions.
          if (nextDiv > this.lastSaxTime) {
              // Trigger note
              this.saxSynth.triggerAttackRelease(note, "4n", nextDiv); 
              this.lastSaxNoteIndex = noteIndex;
              this.lastSaxTime = nextDiv;

              if (this.noteCallback) {
                  Tone.Draw.schedule(() => {
                      this.noteCallback!('SAX', x, y);
                  }, nextDiv);
              }
          }
      }
  }
}

export const audioEngine = new AudioEngine();