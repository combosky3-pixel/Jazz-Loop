// Access global MediaPipe variables loaded via script tags in index.html
declare const Hands: any;
declare const Camera: any;

export class HandTracker {
  private hands: any = null;
  private camera: any = null;
  private videoElement: HTMLVideoElement | null = null;

  constructor(
    onResults: (results: any) => void
  ) {
    this.hands = new Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults(onResults);
  }

  public async start(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    
    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        if (this.hands && this.videoElement) {
          await this.hands.send({ image: this.videoElement });
        }
      },
      width: 1280,
      height: 720
    });

    await this.camera.start();
  }

  public stop() {
    if (this.camera) {
      // Camera utils doesn't have a clean stop in some versions, 
      // but stopping the stream helps.
       const stream = this.videoElement?.srcObject as MediaStream;
       stream?.getTracks().forEach(track => track.stop());
    }
    if (this.hands) {
      this.hands.close();
    }
  }
}