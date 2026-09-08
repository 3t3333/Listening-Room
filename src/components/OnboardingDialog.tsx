import { MonitorSmartphone, Speaker, Wifi } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";

export function OnboardingDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [slide, setSlide] = useState(0);

  // Reset slide when opened
  useEffect(() => {
    if (open) {
      setSlide(0);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="onboarding-dialog">
        <DialogTitle className="sr-only">Connect to Spotify</DialogTitle>
        
        <div className="onboarding-slides" style={{ transform: `translateX(-${slide * 33.333333}%)` }}>
          {/* Slide 1 */}
          <div className="onboarding-slide">
            <div className="onboarding-diagram">
              <div className="diagram-cluster">
                <MonitorSmartphone size={64} strokeWidth={1} color="#fff" />
                <Wifi size={32} strokeWidth={1.5} color="#1db954" className="wifi-icon" />
              </div>
            </div>
            <h3>1. Open Spotify</h3>
            <p>Launch the Spotify app on your phone, tablet, or computer connected to the same Wi-Fi network.</p>
          </div>

          {/* Slide 2 */}
          <div className="onboarding-slide">
            <div className="onboarding-diagram">
              <div className="diagram-playback-bar">
                <div className="bar-left">
                  <div className="bar-art" />
                  <div className="bar-text"><span /><span className="short" /></div>
                </div>
                <div className="bar-center">
                  <div className="bar-controls"><span className="circle" /></div>
                  <div className="bar-timeline"><span className="line" /></div>
                </div>
                <div className="bar-right">
                  <Speaker size={20} strokeWidth={2} color="#1db954" className="highlight-pulse" />
                  <span className="bar-volume" />
                </div>
              </div>
            </div>
            <h3>2. Open Devices Menu</h3>
            <p>Look for the devices icon (the speaker and display) in the bottom corner of your player.</p>
          </div>

          {/* Slide 3 */}
          <div className="onboarding-slide">
            <div className="onboarding-diagram">
              <div className="diagram-device-list">
                <div className="device-list-header">Connect to a device</div>
                <div className="device-item">
                  <MonitorSmartphone size={20} color="#888" />
                  <span>This Computer</span>
                </div>
                <div className="device-item active">
                  <Speaker size={20} color="#1db954" />
                  <span className="text-green">Listening Room Player</span>
                </div>
                <div className="device-item">
                  <MonitorSmartphone size={20} color="#888" />
                  <span>Web Player</span>
                </div>
              </div>
            </div>
            <h3>3. Choose Listening Room</h3>
            <p>Select "Listening Room Player" from the list to instantly connect and start streaming.</p>
          </div>
        </div>

        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`dot ${slide === i ? "active" : ""}`} onClick={() => setSlide(i)} />
            ))}
          </div>
          <div className="onboarding-actions">
            {slide > 0 && <Button variant="outline" onClick={() => setSlide(s => s - 1)}>Back</Button>}
            {slide < 2 ? (
              <Button onClick={() => setSlide(s => s + 1)}>Next</Button>
            ) : (
              <Button onClick={() => onOpenChange(false)}>Got it</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
