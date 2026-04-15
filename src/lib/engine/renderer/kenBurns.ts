import type { MotionSpec } from "@/lib/engine/models";

export function buildFilter(
  motion: MotionSpec,
  durationSec: number,
  fps: number,
  size: { width: number; height: number },
): string {
  const D = Math.round(durationSec * fps);
  const W = size.width;
  const H = size.height;

  switch (motion.type) {
    case "ken_burns_in":
      return `zoompan=z='min(zoom+(1.25-1.0)/(${D}-1),1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    case "ken_burns_out":
      return `zoompan=z='if(eq(on,1),1.3,max(zoom-(1.3-1.05)/(${D}-1),1.05))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    case "pan_left":
      return `zoompan=z=1.1:x='iw*0.2 - iw*0.2*on/(${D}-1)':y='ih*0.5-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    case "pan_right":
      return `zoompan=z=1.1:x='iw*0.2*on/(${D}-1)':y='ih*0.5-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    case "slow_zoom":
      return `zoompan=z='min(zoom+(1.08-1.0)/(${D}-1),1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    case "static":
      return `zoompan=z=1.0:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${D}:s=${W}x${H}:fps=${fps}`;
    default: {
      const exhaustive: never = motion.type;
      throw new Error(`Unknown motion type: ${String(exhaustive)}`);
    }
  }
}
