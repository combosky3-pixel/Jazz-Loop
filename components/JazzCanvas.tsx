
import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import { HandTracker } from '../services/handTracking';
import { audioEngine } from '../services/audioEngine';
import { HandState, AppState, GameGenre } from '../types';

interface JazzCanvasProps {
  appState: AppState;
  setAppState: (state: AppState) => void;
  genre: GameGenre;
}

const JazzCanvas: React.FC<JazzCanvasProps> = ({ appState, setAppState, genre }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  const handStateRef = useRef<HandState>({
    left: null, right: null, isLeftPinching: false, isRightPinching: false, leftSqueeze: 0, rightSqueeze: 0
  });

  // Global Beat/Note flash references for visual reactivity
  const beatFlashRef = useRef(0);
  const noteTriggersRef = useRef<{x: number, y: number, life: number, type: 'left'|'right'}[]>([]);

  const [debugMsg, setDebugMsg] = useState("Initializing Dual-Hand Generative System...");

  // --- Hand Tracking Logic ---
  const getHandOpenness = (landmarks: any[]): number => {
    if (!landmarks || landmarks.length < 21) return 0;
    const wrist = landmarks[0];
    const tips = [8, 12, 16, 20]; 
    let totalDist = 0;
    tips.forEach(idx => {
        const tip = landmarks[idx];
        totalDist += Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
    });
    const avgDist = totalDist / 4;
    const openness = (avgDist - 0.15) / 0.25;
    return Math.max(0, Math.min(1, openness));
  };

  useEffect(() => {
    if (appState !== AppState.RUNNING || !containerRef.current || !videoRef.current) return;

    // Connect Audio Events to Visuals
    audioEngine.onBeat((type) => {
        beatFlashRef.current = 1.0; 
    });

    audioEngine.onNoteTriggered((type, x, y) => {
        // Trigger visual bursts
        // Guess hand based on x position if not explicit (Left < 0.5, Right > 0.5)
        // Note: x is 0-1
        const t = type === 'RHYTHM' ? 'left' : 'right';
        noteTriggersRef.current.push({ x, y, life: 1.0, type: t });
    });

    // Start Hand Tracking
    const onHandResults = (results: any) => {
      let left = null, right = null, leftSqueeze = 0, rightSqueeze = 0;

      if (results.multiHandLandmarks) {
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
          const isRight = results.multiHandedness[index].label === 'Right';
          const tip = landmarks[8]; 
          // Map to 0-1 range (Mirror horizontal)
          const coords = { x: 1 - tip.x, y: tip.y }; 
          
          const openness = getHandOpenness(landmarks);
          const squeeze = 1.0 - openness;

          if (isRight) { right = coords; rightSqueeze = squeeze; }
          else { left = coords; leftSqueeze = squeeze; }
        }
      }

      // Pass data to Audio Engine
      if (right) audioEngine.updateRightHand(right.y, right.x, true, rightSqueeze);
      if (left) audioEngine.updateLeftHand(left.y, left.x, true, leftSqueeze);

      handStateRef.current = { left, right, isLeftPinching: false, isRightPinching: false, leftSqueeze, rightSqueeze };
    };

    handTrackerRef.current = new HandTracker(onHandResults);
    handTrackerRef.current.start(videoRef.current)
      .then(() => setDebugMsg(""))
      .catch(err => setAppState(AppState.ERROR));

    // --- P5.JS SKETCH ---
    const sketch = (p: p5) => {
      let particles: any[] = [];
      
      // Physics & Energy State
      let smoothedAudio = 0;
      let prevLeftHand: p5.Vector | null = null;
      let prevRightHand: p5.Vector | null = null;
      let globalHue = 0;
      let vortexAngle = 0;

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        initParticles();
      };

      const initParticles = () => {
        particles = [];
        let count = 0;
        
        if (genre === GameGenre.JAZZ) count = 300; 
        else if (genre === GameGenre.FUNK) count = 250; 
        else if (genre === GameGenre.ELECTRONIC) count = 60; // Slightly fewer nodes for cleaner connection web

        for (let i = 0; i < count; i++) {
          if (genre === GameGenre.JAZZ) particles.push(new LiquidParticle(p));
          else if (genre === GameGenre.FUNK) particles.push(new VortexParticle(p));
          else if (genre === GameGenre.ELECTRONIC) particles.push(new NeuralNode(p));
        }
      };

      p.draw = () => {
        // --- 1. GLOBAL STATE UPDATES ---
        
        // Audio Energy Analysis
        const rawEnergy = audioEngine.getEnergy(); // 0.0 to 1.0 (linear)
        smoothedAudio = p.lerp(smoothedAudio, rawEnergy, 0.15); // Snappier response
        
        // Hand Vectors
        const currentHands = handStateRef.current;
        const leftVec = currentHands.left ? p.createVector(currentHands.left.x * p.width, currentHands.left.y * p.height) : null;
        const rightVec = currentHands.right ? p.createVector(currentHands.right.x * p.width, currentHands.right.y * p.height) : null;

        // Velocity calc
        const leftVel = (leftVec && prevLeftHand) ? p5.Vector.sub(leftVec, prevLeftHand) : p.createVector(0,0);
        const rightVel = (rightVec && prevRightHand) ? p5.Vector.sub(rightVec, prevRightHand) : p.createVector(0,0);
        prevLeftHand = leftVec ? leftVec.copy() : null;
        prevRightHand = rightVec ? rightVec.copy() : null;

        const handVels = { left: leftVel, right: rightVel };
        const handPos = { left: leftVec, right: rightVec };

        // --- 2. BACKGROUND & AMBIANCE ---
        
        p.blendMode(p.BLEND);
        
        if (genre === GameGenre.ELECTRONIC) {
            // Mode 2: Techno Strobe Logic
            // Background reacts to audio level (0 to 15 brightness)
            // This replaces the solid black with a pulsating dark grey
            const strobeVal = Math.min(25, smoothedAudio * 25);
            p.background(0, 0, strobeVal);
        } else {
            // Modes 0 & 1: Trail Logic
            // Background alpha changes with energy (Pump effect)
            let bgAlpha = 20;
            if (smoothedAudio > 0.4) bgAlpha = 35; // Clears trail faster on high energy
            
            // Flash background on beat (using beatFlashRef from AudioEngine callback)
            if (beatFlashRef.current > 0.01) {
                p.background(0, 0, 10 + (20 * beatFlashRef.current));
                beatFlashRef.current *= 0.85;
            } else {
                p.background(0, bgAlpha);
            }
        }

        // --- 3. RENDER CONTENT ---
        p.blendMode(p.ADD);
        
        // Global Hue Rotation
        globalHue = (p.frameCount * 0.2) % 360;

        // Render Note Bursts (Dual Color System)
        for(let i = noteTriggersRef.current.length - 1; i >= 0; i--) {
            const t = noteTriggersRef.current[i];
            p.noFill();
            // Left (Bass) = Cyan/Purple, Right (Lead) = Orange/Gold
            let h = t.type === 'left' ? 200 : 40; 
            p.stroke(h, 80, 100, t.life * 100);
            p.strokeWeight(3 + (smoothedAudio * 5));
            p.circle(t.x * p.width, t.y * p.height, (1.0 - t.life) * 300);
            t.life -= 0.04;
            if(t.life <= 0) noteTriggersRef.current.splice(i, 1);
        }

        // --- MODE SPECIFIC DRAWING ---
        if (genre === GameGenre.JAZZ) {
            drawJazzMode(p, particles, handPos, handVels, smoothedAudio);
        } else if (genre === GameGenre.FUNK) {
            drawFunkMode(p, particles, handPos, smoothedAudio, globalHue);
        } else if (genre === GameGenre.ELECTRONIC) {
            drawElectronicMode(p, particles, handPos, smoothedAudio);
        }
      };

      // =================================================================
      // MODE 0: JAZZ (Dual-Hand Liquid Flow)
      // =================================================================
      class LiquidParticle {
        pos: p5.Vector; vel: p5.Vector; acc: p5.Vector; prevPos: p5.Vector;
        maxSpeed: number; baseMaxSpeed: number;

        constructor(p: p5) {
            this.pos = p.createVector(p.random(p.width), p.random(p.height));
            this.prevPos = this.pos.copy();
            this.vel = p.createVector(0,0);
            this.acc = p.createVector(0,0);
            this.baseMaxSpeed = p.random(2, 5);
            this.maxSpeed = this.baseMaxSpeed;
        }

        update(p: p5, hands: {left: p5.Vector|null, right: p5.Vector|null}, audio: number) {
            this.prevPos = this.pos.copy();
            
            // Audio Energy increases chaotic movement
            let nScale = 0.005;
            let timeScale = p.frameCount * (0.005 + (audio * 0.02)); 
            let angle = p.noise(this.pos.x * nScale, this.pos.y * nScale, timeScale) * p.TWO_PI * 4;
            let flow = p5.Vector.fromAngle(angle);
            flow.mult(0.5 + (audio * 2)); // Stronger flow on loud audio
            this.acc.add(flow);

            // Hand Gravity
            const applyHandForce = (hPos: p5.Vector | null) => {
                if(!hPos) return;
                let dir = p5.Vector.sub(hPos, this.pos);
                let d = dir.mag();
                if (d < 400) {
                    dir.normalize();
                    dir.mult(0.5); 
                    this.acc.add(dir);
                }
            };
            applyHandForce(hands.left);
            applyHandForce(hands.right);

            this.vel.add(this.acc);
            this.maxSpeed = this.baseMaxSpeed * (1 + audio * 3); // Velocity scales with volume
            this.vel.limit(this.maxSpeed);
            this.pos.add(this.vel);
            this.acc.mult(0);

            // Wrap
            if (this.pos.x > p.width) { this.pos.x = 0; this.prevPos.x = this.pos.x; }
            if (this.pos.x < 0) { this.pos.x = p.width; this.prevPos.x = this.pos.x; }
            if (this.pos.y > p.height) { this.pos.y = 0; this.prevPos.y = this.pos.y; }
            if (this.pos.y < 0) { this.pos.y = p.height; this.prevPos.y = this.pos.y; }
        }

        show(p: p5, hands: {left: p5.Vector|null, right: p5.Vector|null}, audio: number) {
            // Dual Color Logic
            let leftDist = hands.left ? p.dist(this.pos.x, this.pos.y, hands.left.x, hands.left.y) : 9999;
            let rightDist = hands.right ? p.dist(this.pos.x, this.pos.y, hands.right.x, hands.right.y) : 9999;

            let hueVal;
            if (leftDist < rightDist && leftDist < 500) {
                 // Closer to Left (Cool: 200-260)
                 let mapDist = p.map(leftDist, 0, 500, 0, 1);
                 hueVal = p.lerp(200, 260, mapDist);
            } else if (rightDist <= leftDist && rightDist < 500) {
                 // Closer to Right (Warm: 340-40)
                 let mapDist = p.map(rightDist, 0, 500, 0, 1);
                 hueVal = p.lerp(40, 340, mapDist);
            } else {
                 // Neutral (Background flow)
                 hueVal = 220 + (Math.sin(p.frameCount * 0.01) * 20);
            }

            // Energy Brightness
            let sat = p.map(audio, 0, 1, 80, 20); // High energy = closer to white (low sat)
            let bri = p.map(audio, 0, 1, 60, 100);
            let alpha = p.map(audio, 0, 1, 40, 90);

            p.stroke(hueVal, sat, bri, alpha);
            p.strokeWeight(1 + (audio * 4));
            p.line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
        }
      }

      function drawJazzMode(p: p5, pts: LiquidParticle[], hPos: any, hVels: any, audio: number) {
          pts.forEach(pt => {
              pt.update(p, hPos, audio);
              pt.show(p, hPos, audio);
          });
      }

      // =================================================================
      // MODE 1: FUNK (Reactive Spiral)
      // =================================================================
      class VortexParticle {
        x: number; y: number; z: number;
        angleOffset: number;
        baseColorHue: number;

        constructor(p: p5) {
            this.respawn(p);
            this.z = p.random(100, 2000);
            this.baseColorHue = p.random(0, 360);
        }

        respawn(p: p5) {
            this.x = p.random(-p.width, p.width);
            this.y = p.random(-p.height, p.height);
            this.z = p.random(1000, 2000); 
            this.angleOffset = p.random(0, p.TWO_PI);
        }

        update(p: p5, audio: number) {
            // Speed increases with beat
            this.z -= (15 + (audio * 100)); 
            if (this.z < 1) this.respawn(p);
        }

        show(p: p5, hPos: {left: p5.Vector|null, right: p5.Vector|null}, audio: number, gHue: number) {
            let cx = p.width / 2;
            let cy = p.height / 2;

            // Audio expands the ring
            let expansion = 1 + (audio * 0.5);

            // Global rotation determined by hands
            let rot = vortexAngle;
            if (hPos.left) rot -= 0.5; 
            if (hPos.right) rot += 0.5;

            // Projection
            let ang = p.atan2(this.y, this.x) + rot + (this.z * 0.001);
            let rad = p.dist(0,0, this.x, this.y) * expansion;

            let rx = p.cos(ang) * rad;
            let ry = p.sin(ang) * rad;

            let sx = p.map(rx / this.z, 0, 1, 0, p.width/2);
            let sy = p.map(ry / this.z, 0, 1, 0, p.height/2);
            let r = p.map(this.z, 0, 2000, 30 * expansion, 0);

            let hue = (gHue + (this.z * 0.1)) % 360;
            if (hPos.left && !hPos.right) hue = (160 + (this.z*0.1)) % 360;
            if (hPos.right && !hPos.left) hue = (320 + (this.z*0.1)) % 360;

            let bri = p.map(this.z, 0, 2000, 100, 0);
            p.noStroke();
            p.fill(hue, 80, bri);
            p.ellipse(cx + sx, cy + sy, r);
        }
      }

      function drawFunkMode(p: p5, pts: VortexParticle[], hPos: any, audio: number, gHue: number) {
          if (hPos.left) vortexAngle -= 0.02;
          if (hPos.right) vortexAngle += 0.02;
          
          p.push();
          pts.forEach(pt => {
              pt.update(p, audio);
              pt.show(p, hPos, audio, gHue);
          });
          p.pop();
      }

      // =================================================================
      // MODE 2: ELECTRONIC (Cyber Network / System Overload)
      // =================================================================
      class NeuralNode {
        pos: p5.Vector; vel: p5.Vector;
        type: 'neutral' | 'left' | 'right';
        id: number;

        constructor(p: p5) {
            this.pos = p.createVector(p.random(p.width), p.random(p.height));
            this.vel = p5.Vector.random2D().mult(2);
            this.type = 'neutral';
            this.id = Math.random();
        }

        update(p: p5, hPos: {left: p5.Vector|null, right: p5.Vector|null}, audio: number) {
            this.pos.add(this.vel);
            
            // Bounce
            if (this.pos.x < 0 || this.pos.x > p.width) this.vel.x *= -1;
            if (this.pos.y < 0 || this.pos.y > p.height) this.vel.y *= -1;

            // Determine Type based on proximity
            let dLeft = hPos.left ? p.dist(this.pos.x, this.pos.y, hPos.left.x, hPos.left.y) : 9999;
            let dRight = hPos.right ? p.dist(this.pos.x, this.pos.y, hPos.right.x, hPos.right.y) : 9999;

            if (dLeft < 250) this.type = 'left';
            else if (dRight < 250) this.type = 'right';
            else this.type = 'neutral';

            // Audio Glitch / Shake
            if (audio > 0.6 && Math.random() > 0.8) {
                this.pos.x += p.random(-10, 10);
                this.pos.y += p.random(-10, 10);
            }
        }

        show(p: p5) {
            let hue = 0;
            if (this.type === 'left') hue = 200; // Blue
            else if (this.type === 'right') hue = 0; // Red
            else hue = 120; // Green neutral

            p.fill(hue, 90, 100);
            p.noStroke();
            p.circle(this.pos.x, this.pos.y, 6);
        }
      }

      function drawElectronicMode(p: p5, nodes: NeuralNode[], hPos: any, audio: number) {
          p.push();
          
          // 1. Camera Effects (Beat Reaction)
          // Center coordinate system for zoom
          p.translate(p.width / 2, p.height / 2);

          // Global Zoom: "Breathe" with the bass
          // scale(1.0 + audioLevel * 0.05)
          let zoomFactor = 1.0 + (audio * 0.08); // Slight boost to 0.08 for visibility
          p.scale(zoomFactor);

          // Screen Shake: If high energy (Techno Kick)
          if (audio > 0.6) {
             let shakeVal = (audio - 0.6) * 40; 
             p.translate(p.random(-shakeVal, shakeVal), p.random(-shakeVal, shakeVal));
          }

          // Move back to top-left origin for drawing nodes
          p.translate(-p.width / 2, -p.height / 2);

          // 2. Draw Connections
          // AudioLevel controls line thickness
          p.strokeWeight(1 + (audio * 8)); 
          
          for (let i = 0; i < nodes.length; i++) {
              let n1 = nodes[i];
              for (let j = i + 1; j < nodes.length; j++) {
                  let n2 = nodes[j];
                  let d = p.dist(n1.pos.x, n1.pos.y, n2.pos.x, n2.pos.y);
                  
                  // Connection threshold increases with energy
                  let connectDist = 180 + (audio * 100);

                  if (d < connectDist) {
                      let alpha = p.map(d, 0, connectDist, 100, 0);
                      
                      let c1;
                      if (n1.type === 'left') c1 = p.color(200, 90, 100);
                      else if (n1.type === 'right') c1 = p.color(0, 90, 100);
                      else c1 = p.color(120, 50, 80);
                      
                      // Intensity: High Audio = Brighter, Whiter lines
                      if (audio > 0.5) {
                          let bleach = p.map(audio, 0.5, 1.0, 0, 1);
                          let s = p.lerp(p.saturation(c1), 0, bleach); // Desaturate to white
                          p.stroke(p.hue(c1), s, 100, alpha);
                      } else {
                          p.stroke(p.hue(c1), p.saturation(c1), p.brightness(c1), alpha);
                      }
                      
                      p.line(n1.pos.x, n1.pos.y, n2.pos.x, n2.pos.y);
                  }
              }
              // Update and draw node
              n1.update(p, hPos, audio);
              n1.show(p);
          }
          p.pop();
      }

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        initParticles();
      };
    };

    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      handTrackerRef.current?.stop();
      p5InstanceRef.current?.remove();
    };
  }, [appState, setAppState, genre]);

  return (
    <div className="absolute inset-0 w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <div ref={containerRef} className="w-full h-full" />
      {debugMsg && <div className="absolute top-4 left-4 text-xs text-gray-500 font-mono z-50 mix-blend-difference">{debugMsg}</div>}
    </div>
  );
};

export default JazzCanvas;
