
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
  const kickFlashRef = useRef<number>(0); // Alpha value for kick flash
  const bassPulseRef = useRef<number>(0); // New Bass Pulse opacity

  // Track previous positions for velocity calculation
  const prevRightRef = useRef<{x:number, y:number} | null>(null);
  const prevLeftRef = useRef<{x:number, y:number} | null>(null);

  const [debugMsg, setDebugMsg] = useState("Initializing Quartet...");

  useEffect(() => {
    if (appState !== AppState.RUNNING || !containerRef.current || !videoRef.current) return;

    // 1. Audio Callbacks
    audioEngine.onBeat((type) => {
        if (type === 'KICK') {
            kickFlashRef.current = 100; // Trigger flash
        }
    });

    audioEngine.onNoteTriggered((type, x, y) => {
        if (type === 'LEAD') {
            shockwavesRef.current.push({
                x: x, 
                y: y,
                size: 5, 
                maxSize: 100,
                alpha: 255,
                color: [0, 255, 255], // Cyan (Vibes)
                speed: 15
            });
        } else if (type === 'SAX') {
            // Gold/Brass Shockwaves for Sax
            shockwavesRef.current.push({
                x: x, 
                y: y,
                size: 15, 
                maxSize: 200,
                alpha: 200,
                color: [255, 215, 0], // Gold
                speed: 8
            });
        } else if (type === 'BASS') {
            // Trigger floor pulse instead of a specific ripple
            bassPulseRef.current = 200; 
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
          const coords = { x: 1 - tip.x, y: tip.y, z: tip.z }; // Mirror X

          let velocity = 0;
          if (isRight) {
             if (prevRightRef.current) {
                 velocity = Math.hypot(coords.x - prevRightRef.current.x, coords.y - prevRightRef.current.y);
             }
             prevRightRef.current = coords;
             right = coords;
             
             if (velocity > 0.005) {
                audioEngine.updateLead(coords.y, coords.x, true);
             }

          } else {
             if (prevLeftRef.current) {
                 velocity = Math.hypot(coords.x - prevLeftRef.current.x, coords.y - prevLeftRef.current.y);
             }
             prevLeftRef.current = coords;
             left = coords;
             
             // Update Sax
             if (velocity > 0.005) {
                audioEngine.updateSax(coords.y, coords.x, true);
             } else {
                // Still update filter if hand is present but slow
                audioEngine.updateSax(coords.y, coords.x, false);
             }
          }
          totalEnergy += velocity;
        }
      }

      audioEngine.setGlobalEnergy(Math.min(totalEnergy * 15, 1));

      handStateRef.current = {
        left,
        right,
        isLeftPinching: false,
        isRightPinching: false
      };
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
      const particleCount = 350; // Optimized count
      const particles: Particle[] = [];

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.background(0);
        
        for (let i = 0; i < particleCount; i++) {
          particles.push(new Particle(p));
        }
      };

      p.draw = () => {
        // Trail Effect (Long exposure look)
        p.blendMode(p.BLEND);
        p.background(0, 30); 

        // Kick Flash
        if (kickFlashRef.current > 0) {
            p.background(30, 30, 45, kickFlashRef.current);
            kickFlashRef.current -= 10;
        }

        // Bass Floor Pulse (Dark Blue Glow at bottom)
        if (bassPulseRef.current > 0) {
            p.noStroke();
            // Create a gradient-like rect stack for glow
            for(let i = 0; i < 150; i+=10) {
                let alpha = (bassPulseRef.current / 150) * (255 - (i * 1.5));
                if (alpha < 0) alpha = 0;
                p.fill(0, 0, 100, alpha * 0.5); // Deep Blue
                p.rect(0, p.height - i, p.width, 10);
            }
            bassPulseRef.current -= 5;
        }

        // Shockwaves
        p.blendMode(p.ADD);
        p.noFill();
        p.strokeWeight(3);
        
        for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
            const sw = shockwavesRef.current[i];
            p.stroke(sw.color[0], sw.color[1], sw.color[2], sw.alpha);
            p.circle(sw.x * p.width, sw.y * p.height, sw.size);
            
            sw.size += sw.speed;
            sw.alpha -= 5;
            
            if (sw.alpha <= 0) {
                shockwavesRef.current.splice(i, 1);
            }
        }

        // --- PHYSICS ENGINE ---
        const rh = handStateRef.current.right;
        const lh = handStateRef.current.left;
        
        // Convert normalized hand coordinates to screen vectors
        const rhVec = rh ? p.createVector(rh.x * p.width, rh.y * p.height) : null;
        const lhVec = lh ? p.createVector(lh.x * p.width, lh.y * p.height) : null;

        for (const part of particles) {
            // 1. Calculate Forces
            const sep = part.separate(particles); 
            const flow = part.flow();             
            
            // Weighting
            sep.mult(1.5); 
            flow.mult(0.5); 

            // Apply Base Forces
            part.applyForce(sep);
            part.applyForce(flow);

            // 2. Hand Attraction (Seek)
            if (rhVec) {
                const seekForce = part.seek(rhVec);
                seekForce.mult(0.8); 
                part.applyForce(seekForce);
            }
            if (lhVec) {
                const seekForce = part.seek(lhVec);
                seekForce.mult(0.6); 
                part.applyForce(seekForce);
            }

            // 3. Integration
            part.update();
            part.checkEdges();
            part.show();
        }
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        p.background(0);
      };

      // --- STEERING PHYSICS PARTICLE ---
      class Particle {
        p: p5;
        pos: p5.Vector;
        vel: p5.Vector;
        acc: p5.Vector;
        maxSpeed: number;
        maxForce: number;
        baseColor: p5.Color;
        size: number;

        constructor(p: p5) {
          this.p = p;
          this.pos = p.createVector(p.random(p.width), p.random(p.height));
          this.vel = p.createVector(p.random(-1, 1), p.random(-1, 1));
          this.acc = p.createVector(0, 0);
          this.maxSpeed = 4;
          this.maxForce = 0.2;
          this.size = p.random(3, 6);

          // Neon Noir Palette
          const r = p.random();
          if (r < 0.4) this.baseColor = p.color(0, 255, 255, 180); // Cyan
          else if (r < 0.7) this.baseColor = p.color(180, 0, 255, 180); // Purple
          else this.baseColor = p.color(255, 215, 0, 180); // Gold
        }

        applyForce(force: p5.Vector) {
            this.acc.add(force);
        }

        separate(particles: Particle[]) {
            let desiredSeparation = 25;
            let steer = this.p.createVector(0, 0);
            let count = 0;
            
            // Optimization for loop
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
            }

            if (count > 0) {
                steer.div(count);
            }

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
            let flowForce = p5.Vector.fromAngle(angle);
            return flowForce;
        }

        update() {
            this.vel.add(this.acc);
            this.vel.limit(this.maxSpeed);
            this.vel.mult(0.96); // Friction
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
            this.p.noStroke();
            this.p.fill(this.baseColor);
            this.p.circle(this.pos.x, this.pos.y, this.size);
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
        <div className="absolute top-4 left-4 text-xs text-gray-500 font-mono pointer-events-none z-50">
          {debugMsg}
        </div>
      )}
    </div>
  );
};

export default JazzCanvas;
