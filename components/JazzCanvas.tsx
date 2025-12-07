import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import { HandTracker } from '../services/handTracking';
import { audioEngine } from '../services/audioEngine';
import { HandState, AppState } from '../types';

interface JazzCanvasProps {
  appState: AppState;
  setAppState: (state: AppState) => void;
}

const JazzCanvas: React.FC<JazzCanvasProps> = ({ appState, setAppState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handTrackerRef = useRef<HandTracker | null>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  const handStateRef = useRef<HandState>({
    left: null,
    right: null,
    isLeftPinching: false,
    isRightPinching: false,
  });

  // Visual Event State
  const shockwavesRef = useRef<any[]>([]);
  const kickPulseRef = useRef<number>(0); 

  // Velocity tracking
  const prevRightRef = useRef<{x:number, y:number} | null>(null);
  const prevLeftRef = useRef<{x:number, y:number} | null>(null);

  const [debugMsg, setDebugMsg] = useState("Initializing Neon Noir Engine...");

  useEffect(() => {
    if (appState !== AppState.RUNNING || !containerRef.current || !videoRef.current) return;

    // 1. Audio Callbacks
    audioEngine.onBeat((type) => {
        if (type === 'KICK') {
            kickPulseRef.current = 255; // Max pulse for vignette
        }
    });

    audioEngine.onNoteTriggered((type, x, y) => {
        // Add shockwaves (Visual accents)
        if (type === 'LEAD') {
            shockwavesRef.current.push({
                x: x, y: y, size: 10, maxSize: 150, alpha: 255,
                color: [0, 255, 255], // Cyan
                width: 2, speed: 10
            });
        } else if (type === 'SAX') {
            shockwavesRef.current.push({
                x: x, y: y, size: 20, maxSize: 300, alpha: 200,
                color: [255, 200, 50], // Gold
                width: 4, speed: 5
            });
        }
    });

    // 2. Hand Tracking
    const onHandResults = (results: any) => {
      let left = null;
      let right = null;
      let totalEnergy = 0;

      if (results.multiHandLandmarks) {
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
          const classification = results.multiHandedness[index];
          const isRight = classification.label === 'Right';
          const tip = landmarks[8]; 
          const coords = { x: 1 - tip.x, y: tip.y, z: tip.z }; 

          let velocity = 0;
          if (isRight) {
             if (prevRightRef.current) {
                 velocity = Math.hypot(coords.x - prevRightRef.current.x, coords.y - prevRightRef.current.y);
             }
             prevRightRef.current = coords;
             right = coords;
             if (velocity > 0.005) audioEngine.updateLead(coords.y, coords.x, true);
          } else {
             if (prevLeftRef.current) {
                 velocity = Math.hypot(coords.x - prevLeftRef.current.x, coords.y - prevLeftRef.current.y);
             }
             prevLeftRef.current = coords;
             left = coords;
             if (velocity > 0.005) audioEngine.updateSax(coords.y, coords.x, true);
             else audioEngine.updateSax(coords.y, coords.x, false);
          }
          totalEnergy += velocity;
        }
      }
      audioEngine.setGlobalEnergy(Math.min(totalEnergy * 15, 1));
      handStateRef.current = { left, right, isLeftPinching: false, isRightPinching: false };
    };

    handTrackerRef.current = new HandTracker(onHandResults);
    handTrackerRef.current.start(videoRef.current)
      .then(() => setDebugMsg(""))
      .catch(err => {
        console.error(err);
        setAppState(AppState.ERROR);
      });

    // 3. P5 Visualization
    const sketch = (p: p5) => {
      const particleCount = 400; 
      const particles: RibbonParticle[] = [];
      const smokeParticles: SmokeParticle[] = [];

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.background(0);
        
        // Initialize Ribbons
        for (let i = 0; i < particleCount; i++) {
          particles.push(new RibbonParticle(p));
        }

        // Initialize Volumetric Smoke (Fewer, larger particles)
        for (let i = 0; i < 30; i++) {
            smokeParticles.push(new SmokeParticle(p));
        }
      };

      p.draw = () => {
        // --- 1. BLOOM / TRAIL EFFECT ---
        // Very low opacity background refresh creates light accumulation (Bloom)
        p.blendMode(p.BLEND);
        p.background(5, 5, 10, 15); // Deep dark blue-black, high trails

        // --- 2. VOLUMETRIC SMOKE LAYER ---
        p.blendMode(p.ADD);
        for(let smoke of smokeParticles) {
            smoke.update();
            smoke.show();
        }

        // --- 3. PARTICLE RIBBONS ---
        const rh = handStateRef.current.right;
        const lh = handStateRef.current.left;
        
        const rhVec = rh ? p.createVector(rh.x * p.width, rh.y * p.height) : null;
        const lhVec = lh ? p.createVector(lh.x * p.width, lh.y * p.height) : null;

        for (const part of particles) {
            // Physics
            const sep = part.separate(particles); 
            const flow = part.flow();             
            sep.mult(1.8); 
            flow.mult(0.6); 
            part.applyForce(sep);
            part.applyForce(flow);

            // Hand Attraction & Color Logic
            let attractForce = p.createVector(0,0);
            let targetCol = p.color(50, 0, 120, 100); // Default Indigo/Purple

            if (rhVec) {
                const f = part.seek(rhVec);
                const d = p5.Vector.dist(part.pos, rhVec);
                if (d < 300) {
                    // Right Hand = Cyan/Ice
                    targetCol = p.color(0, 255, 255, 200); 
                    f.mult(1.2); 
                }
                attractForce.add(f);
            }
            if (lhVec) {
                const f = part.seek(lhVec);
                const d = p5.Vector.dist(part.pos, lhVec);
                if (d < 300) {
                    // Left Hand = Gold/Brass
                    targetCol = p.color(255, 180, 50, 200);
                    f.mult(0.9);
                }
                attractForce.add(f);
            }

            part.applyForce(attractForce);
            part.updateColor(targetCol);
            part.update();
            part.checkEdges();
            part.show(); // Draws ribbon
        }

        // --- 4. SHOCKWAVES ---
        p.noFill();
        for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
            const sw = shockwavesRef.current[i];
            p.stroke(sw.color[0], sw.color[1], sw.color[2], sw.alpha);
            p.strokeWeight(sw.width);
            p.circle(sw.x * p.width, sw.y * p.height, sw.size);
            
            sw.size += sw.speed;
            sw.alpha -= 8; // Fade faster
            
            if (sw.alpha <= 0) shockwavesRef.current.splice(i, 1);
        }

        // --- 5. POST-PROCESSING (Vignette & Grain) ---
        p.blendMode(p.MULTIPLY);
        // Vignette Pulse synced to Kick
        const ctx = p.drawingContext as CanvasRenderingContext2D;
        const pulse = kickPulseRef.current;
        if (pulse > 0) kickPulseRef.current -= 10;
        
        // Radial Gradient for Vignette
        const grad = ctx.createRadialGradient(
            p.width/2, p.height/2, p.height * 0.4, 
            p.width/2, p.height/2, p.height * 1.2
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)'); // Transparent center
        // Edges get darker, pulse makes them slightly lighter/more dynamic? 
        // Actually, let's make the pulse intensify the darkness or shift the stops
        const edgeAlpha = 0.6 + (pulse / 1000); 
        grad.addColorStop(1, `rgba(0,0,0,${edgeAlpha})`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, p.width, p.height);

        // Film Grain (Analog Noise)
        p.blendMode(p.ADD); // Add noise on top
        p.stroke(255, 15);
        p.strokeWeight(1);
        // Draw random points (optimization: dont draw full screen pixels)
        for(let i=0; i<800; i++) {
            p.point(p.random(p.width), p.random(p.height));
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        p.background(0);
      };

      // --- SMOKE PARTICLE CLASS ---
      class SmokeParticle {
          p: p5;
          pos: p5.Vector;
          vel: p5.Vector;
          size: number;
          offset: number;

          constructor(p: p5) {
              this.p = p;
              this.pos = p.createVector(p.random(p.width), p.random(p.height));
              this.vel = p.createVector(p.random(-0.5, 0.5), p.random(-0.5, 0.5));
              this.size = p.random(200, 500);
              this.offset = p.random(1000);
          }

          update() {
              this.pos.add(this.vel);
              if (this.pos.x < -this.size) this.pos.x = this.p.width + this.size;
              if (this.pos.x > this.p.width + this.size) this.pos.x = -this.size;
              if (this.pos.y < -this.size) this.pos.y = this.p.height + this.size;
              if (this.pos.y > this.p.height + this.size) this.pos.y = -this.size;
          }

          show() {
              const n = this.p.noise(this.pos.x * 0.002, this.pos.y * 0.002, this.p.frameCount * 0.005);
              // Smoky colors: Deep purple/blue haze
              this.p.noStroke();
              this.p.fill(30, 20, 60, 2 * n); // Very low alpha, modulated by noise
              this.p.circle(this.pos.x, this.pos.y, this.size * n + 100);
          }
      }

      // --- RIBBON PARTICLE CLASS ---
      class RibbonParticle {
        p: p5;
        pos: p5.Vector;
        vel: p5.Vector;
        acc: p5.Vector;
        maxSpeed: number;
        maxForce: number;
        col: p5.Color;
        targetCol: p5.Color;

        constructor(p: p5) {
          this.p = p;
          this.pos = p.createVector(p.random(p.width), p.random(p.height));
          this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
          this.acc = p.createVector(0, 0);
          this.maxSpeed = 5;
          this.maxForce = 0.2;
          this.col = p.color(50, 0, 120, 100);
          this.targetCol = this.col;
        }

        applyForce(force: p5.Vector) {
            this.acc.add(force);
        }

        updateColor(target: p5.Color) {
            this.targetCol = target;
            // Lerp color manually for performance or use p5 lerpColor
            this.col = this.p.lerpColor(this.col, this.targetCol, 0.05);
        }

        separate(particles: RibbonParticle[]) {
            let desiredSeparation = 20;
            let steer = this.p.createVector(0, 0);
            let count = 0;
            // Optimization: check fewer neighbors or use spatial hash (not implemented here for simplicity)
            // Just limit loop or radius
            for (let i = 0; i < particles.length; i++) {
                const other = particles[i];
                if (other === this) continue;
                const d = p5.Vector.dist(this.pos, other.pos);
                if (d > 0 && d < desiredSeparation) {
                    let diff = p5.Vector.sub(this.pos, other.pos);
                    diff.normalize();
                    diff.div(d); 
                    steer.add(diff);
                    count++;
                }
                // Break early for performance if swarm is dense? No, keeps flow smooth.
            }
            if (count > 0) steer.div(count);
            if (steer.mag() > 0) {
                steer.normalize();
                steer.mult(this.maxSpeed);
                steer.sub(this.vel);
                steer.limit(this.maxForce);
            }
            return steer;
        }

        seek(target: p5.Vector) {
            let desired = p5.Vector.sub(target, this.pos);
            desired.normalize();
            desired.mult(this.maxSpeed);
            let steer = p5.Vector.sub(desired, this.vel);
            steer.limit(this.maxForce);
            return steer;
        }

        flow() {
            let scale = 0.005;
            let zOff = this.p.frameCount * 0.003;
            let noiseVal = this.p.noise(this.pos.x * scale, this.pos.y * scale, zOff);
            let angle = noiseVal * this.p.TWO_PI * 4;
            return p5.Vector.fromAngle(angle);
        }

        update() {
            this.vel.add(this.acc);
            this.vel.limit(this.maxSpeed);
            this.vel.mult(0.96); 
            this.pos.add(this.vel);
            this.acc.mult(0); 
        }

        checkEdges() {
            if (this.pos.x > this.p.width) this.pos.x = 0;
            else if (this.pos.x < 0) this.pos.x = this.p.width;
            if (this.pos.y > this.p.height) this.pos.y = 0;
            else if (this.pos.y < 0) this.pos.y = this.p.height;
        }

        show() {
            // Draw Ribbon (Line oriented by velocity)
            this.p.stroke(this.col);
            this.p.strokeWeight(2);
            // Tail length depends on speed
            const speed = this.vel.mag();
            const tail = p5.Vector.mult(this.vel, 3 + speed); // Longer tail at speed
            this.p.line(this.pos.x, this.pos.y, this.pos.x - tail.x, this.pos.y - tail.y);
        }
      }
    };

    p5InstanceRef.current = new p5(sketch, containerRef.current);

    return () => {
      handTrackerRef.current?.stop();
      p5InstanceRef.current?.remove();
    };
  }, [appState, setAppState]);

  return (
    <div className="absolute inset-0 w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <div ref={containerRef} className="w-full h-full" />
      {debugMsg && (
        <div className="absolute top-4 left-4 text-xs text-gray-500 font-mono pointer-events-none z-50 mix-blend-difference">
          {debugMsg}
        </div>
      )}
    </div>
  );
};

export default JazzCanvas;